/**
 * The Lua that makes outbound pacing atomic across every API replica and worker
 * (CPS-004). A script runs to completion before Redis serves anything else, so
 * "check every clock, then move every clock" cannot interleave with another
 * caller. Redis `TIME` is the only clock used: replicas never compare their own
 * wall clocks, so a skewed host cannot grant itself extra capacity.
 *
 * Every key a script touches shares the account's `{hash tag}`, so the whole
 * budget of one provider account lives in one slot if the deployment is ever
 * clustered. The per-second and per-hour counter keys are derived from `TIME`
 * inside the script and so are not declared; they carry the same tag.
 *
 * `pacing.test.ts` runs these against the pure `PacingClocks` and, with a real
 * Redis, against concurrent callers.
 */

/**
 * Try to take one grant.
 *
 * KEYS[1..4] the clock of traffic level 0..3 · KEYS[5] the workspace clock ·
 * KEYS[6] the idempotency marker
 *
 * ARGV[1] level · ARGV[2] mode (`acquire`, `peek`, `force`, `observe`) ·
 * ARGV[3..6] the spacing of each level's clock, microseconds ·
 * ARGV[7] the workspace spacing, microseconds (0: no workspace clock) ·
 * ARGV[8] extra TTL of the workspace clock, ms · ARGV[9] `1` to count the
 * attempt · ARGV[10] idempotency TTL, seconds (0: none) · ARGV[11] per-second
 * counter key prefix · ARGV[12] per-hour hash key prefix · ARGV[13] per-second
 * counter TTL · ARGV[14] per-hour hash TTL · ARGV[15] the guard time automated
 * levels leave the shared level-0 clock free, microseconds · ARGV[16] the
 * furthest an overage may push a clock past now, microseconds (0: no bound) ·
 * ARGV[17] the recovery wait of the start (egress) clocks, microseconds (0: none)
 *
 * Recovery. A start clock that does not exist has lost its state (a Redis
 * restart without persistence, a fresh account): the first `acquire` waits
 * ARGV[17] so the grants made just before cannot share a second with new ones.
 * Those clocks are kept for a day after their last grant, so an account that
 * was merely quiet for a minute is not made to wait — a person's first dial
 * after a pause goes out at once.
 *
 * Modes. `acquire` grants only when every clock allows it. `peek` reports
 * without moving anything. `force` grants regardless and counts an overage when
 * a clock was busy: a person waiting on the line is never refused. `observe`
 * always lets the caller through, moves the clocks only when they allowed it,
 * and counts what enforcement WOULD have deferred.
 *
 * Returns {granted, retryAfterMicros, nowMicros, blockedBy, reused, wouldDefer,
 * overage} with blockedBy -1 (none), 0..3 (a level clock) or 10 (the workspace clock).
 */
export const CPS_ACQUIRE_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000000 + tonumber(t[2])
local level = tonumber(ARGV[1])
local mode = ARGV[2]
local wsInterval = tonumber(ARGV[7])
local idemTtl = tonumber(ARGV[10])
local guard = 0
if level >= 1 then guard = tonumber(ARGV[15]) end
local horizon = tonumber(ARGV[16])
local recovery = tonumber(ARGV[17] or '0')
local keep = 60000
if recovery > 0 then keep = 86400000 end
if recovery > 0 and mode == 'acquire' and redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('SET', KEYS[1], string.format('%.0f', now + recovery), 'PX', 61000)
  return {0, recovery, now, 0, 0, 0, 0}
end

if idemTtl > 0 and redis.call('EXISTS', KEYS[6]) == 1 then
  return {1, 0, now, -1, 1, 0, 0}
end

local retry = 0
local blocked = -1
for i = 0, level do
  local tat = tonumber(redis.call('GET', KEYS[i + 1]) or '0') or 0
  if i == 0 and tat > 0 then tat = tat + guard end
  if tat > now and (tat - now) > retry then
    retry = tat - now
    blocked = i
  end
end
if wsInterval > 0 then
  local tat = tonumber(redis.call('GET', KEYS[5]) or '0') or 0
  if tat > now and (tat - now) > retry then
    retry = tat - now
    blocked = 10
  end
end

if mode == 'peek' then
  return {(retry == 0) and 1 or 0, retry, now, blocked, 0, 0, 0}
end

local wouldDefer = 0
local overage = 0
if retry > 0 then
  if mode == 'acquire' then
    return {0, retry, now, blocked, 0, 0, 0}
  elseif mode == 'observe' then
    wouldDefer = 1
  elseif mode == 'force' then
    overage = 1
  end
end

if wouldDefer == 0 then
  for i = 0, level do
    local key = KEYS[i + 1]
    local tat = tonumber(redis.call('GET', key) or '0') or 0
    if tat < now then tat = now end
    tat = tat + tonumber(ARGV[3 + i])
    if overage == 1 and horizon > 0 and (tat - now) > horizon then tat = now + horizon end
    redis.call('SET', key, string.format('%.0f', tat), 'PX', math.ceil((tat - now) / 1000) + keep)
  end
  if wsInterval > 0 then
    local tat = tonumber(redis.call('GET', KEYS[5]) or '0') or 0
    if tat < now then tat = now end
    tat = tat + wsInterval
    redis.call('SET', KEYS[5], string.format('%.0f', tat), 'PX', math.ceil((tat - now) / 1000) + tonumber(ARGV[8]))
  end
end

if idemTtl > 0 then
  redis.call('SET', KEYS[6], '1', 'EX', idemTtl)
end

if ARGV[9] == '1' then
  local sec = math.floor(now / 1000000)
  local secKey = ARGV[11] .. string.format('%d', sec)
  local count = redis.call('INCR', secKey)
  if count == 1 then redis.call('EXPIRE', secKey, ARGV[13]) end
  local hourKey = ARGV[12] .. string.format('%d', math.floor(sec / 3600) * 3600)
  local peak = tonumber(redis.call('HGET', hourKey, 'peak') or '0') or 0
  if count > peak then redis.call('HSET', hourKey, 'peak', count) end
  redis.call('HINCRBY', hourKey, 'attempts', 1)
  redis.call('HINCRBY', hourKey, 'l' .. level, 1)
  if overage == 1 then redis.call('HINCRBY', hourKey, 'overage', 1) end
  if wouldDefer == 1 then redis.call('HINCRBY', hourKey, 'would_defer_l' .. level, 1) end
  redis.call('EXPIRE', hourKey, ARGV[14])
end

return {1, 0, now, -1, 0, wouldDefer, overage}
`;

/**
 * Add to the current hour's counters, optionally counting one attempt in the
 * current second (a browser leg Ringee only sees through its webhook).
 *
 * KEYS[1] dedupe marker (used only when ARGV[6] > 0)
 * ARGV[1] per-hour hash key prefix · ARGV[2] its TTL · ARGV[3] `1` to count an
 * attempt · ARGV[4] per-second counter key prefix · ARGV[5] its TTL ·
 * ARGV[6] dedupe TTL, seconds (0: none) · ARGV[7..] field, amount pairs
 *
 * Returns 1 when recorded, 0 when the dedupe marker was already there.
 */
export const CPS_RECORD_LUA = `
if tonumber(ARGV[6]) > 0 then
  local fresh = redis.call('SET', KEYS[1], '1', 'EX', ARGV[6], 'NX')
  if not fresh then return 0 end
end
local t = redis.call('TIME')
local sec = tonumber(t[1])
local hourKey = ARGV[1] .. string.format('%d', math.floor(sec / 3600) * 3600)
if ARGV[3] == '1' then
  local secKey = ARGV[4] .. string.format('%d', sec)
  local count = redis.call('INCR', secKey)
  if count == 1 then redis.call('EXPIRE', secKey, ARGV[5]) end
  local peak = tonumber(redis.call('HGET', hourKey, 'peak') or '0') or 0
  if count > peak then redis.call('HSET', hourKey, 'peak', count) end
  redis.call('HINCRBY', hourKey, 'attempts', 1)
end
for i = 7, #ARGV, 2 do
  redis.call('HINCRBY', hourKey, ARGV[i], tonumber(ARGV[i + 1]))
end
redis.call('EXPIRE', hourKey, ARGV[2])
return 1
`;

/**
 * The counted attempts of the last `ARGV[2]` seconds, oldest first, after the
 * server's current second.
 *
 * ARGV[1] per-second counter key prefix · ARGV[2] how many seconds
 */
export const CPS_RECENT_LUA = `
local t = redis.call('TIME')
local nowSec = tonumber(t[1])
local n = tonumber(ARGV[2])
local out = {nowSec}
for i = n - 1, 0, -1 do
  local value = redis.call('GET', ARGV[1] .. string.format('%d', nowSec - i))
  out[#out + 1] = tonumber(value or '0') or 0
end
return out
`;
