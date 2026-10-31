import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable, Transform, pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/**
 * Requests Ringee makes to an address someone outside chose — a website to
 * read, a customer's Odoo server — must not reach Ringee's own network. This
 * module is that network policy: what counts as a reserved address, and a
 * request whose socket can only connect to an address that passed it.
 */

/** Whether an IP literal is in a range Ringee must never request. */
export function isReservedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isReservedIpv4(address);
  if (version === 6) return isReservedIpv6(address);
  return false;
}

/** Loopback, link-local, private and other reserved targets, by hostname. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  return isIP(host) ? isReservedAddress(host) : false;
}

/**
 * A `lookup` for sockets that refuses a name answering with any reserved
 * address. Used as the socket's own resolver, the address it checks is the
 * address the socket connects to — no second resolution an attacker's DNS
 * could answer differently.
 */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true }).then(
    (entries) => {
      if (
        entries.length === 0 ||
        entries.some((entry) => isReservedAddress(entry.address))
      ) {
        callback(
          new Error("That address is not a public network address."),
          "",
          undefined,
        );
        return;
      }
      if ((options as { all?: boolean }).all) {
        callback(null, entries);
      } else {
        callback(null, entries[0].address, entries[0].family);
      }
    },
    (error: NodeJS.ErrnoException) => callback(error, "", undefined),
  );
};

export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
  }
}

const DEFAULT_MAX_BODY_BYTES = 1_000_000;

export interface PublicRequestInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** Largest decoded body accepted; defaults to 1 MB. */
  maxBodyBytes?: number;
  /** Operator escape hatch for a private deployment; never set from a request. */
  allowPrivateNetwork?: boolean;
}

/**
 * One HTTP(S) request to a public address, answered as a WHATWG `Response`.
 * Redirects are not followed: a caller that follows them must put each hop
 * through its own checks. The body is decompressed here, and counted after
 * decompression, so a small compressed reply cannot expand without bound.
 */
export function requestPublic(
  target: URL,
  init: PublicRequestInit,
): Promise<Response> {
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return Promise.reject(new Error("Only http and https are supported."));
  }
  if (!init.allowPrivateNetwork && isPrivateHost(target.hostname)) {
    return Promise.reject(
      new Error("That address is not a public network address."),
    );
  }
  const maxBodyBytes = init.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    return Promise.reject(
      new Error("A positive response body limit is required."),
    );
  }
  return new Promise((resolve, reject) => {
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      target,
      {
        method: init.method ?? "GET",
        headers: {
          ...init.headers,
          "accept-encoding": "gzip, deflate, br",
        },
        ...(init.allowPrivateNetwork ? {} : { lookup: publicLookup }),
        signal: AbortSignal.timeout(init.timeoutMs),
      },
      (res) => {
        try {
          const status = res.statusCode ?? 0;
          if (status < 200 || status > 599) {
            res.destroy();
            reject(new Error(`Unexpected status ${status}`));
            return;
          }
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            // The body handed on is decoded, so its encoding headers no
            // longer describe it.
            if (name === "content-encoding" || name === "content-length")
              continue;
            for (const one of Array.isArray(value) ? value : [value]) {
              headers.append(name, one);
            }
          }
          const body =
            status === 204 || status === 205 || status === 304
              ? null
              : (Readable.toWeb(
                  decodedBody(res, maxBodyBytes),
                ) as unknown as ReadableStream<Uint8Array>);
          const response = new Response(body, {
            status,
            statusText: res.statusMessage,
            headers,
          });
          // `fetch` reports where a response came from; callers read it.
          Object.defineProperty(response, "url", { value: target.href });
          // Null-body statuses still own a socket; discard any provider body.
          if (body === null) res.destroy();
          resolve(response);
        } catch (error) {
          // This callback runs after the Promise executor returned. Throwing
          // here would escape the promise and terminate the API process.
          res.destroy();
          reject(error);
        }
      },
    );
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

/** The response body decompressed, failing once it passes `maxBytes`. */
function decodedBody(res: IncomingMessage, maxBytes: number): Readable {
  const encoding = String(res.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();
  let decoder: Transform | undefined;
  if (encoding === "gzip" || encoding === "x-gzip") {
    decoder = createGunzip();
  } else if (encoding === "deflate") {
    decoder = createInflate();
  } else if (encoding === "br") {
    decoder = createBrotliDecompress();
  }
  let seen = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length;
      if (seen > maxBytes) {
        done(new ResponseTooLargeError(maxBytes));
        return;
      }
      done(null, chunk);
    },
  });
  // Propagate errors and cancellation in both directions: exceeding the
  // decoded budget must stop the decoder AND close its upstream socket.
  if (decoder) pipeline(res, decoder, limit, () => undefined);
  else pipeline(res, limit, () => undefined);
  return limit;
}

function isReservedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n)))
    return true;
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isReservedIpv6(address: string): boolean {
  // Compared as numbers, never as text: the URL parser rewrites
  // `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`, and a textual check for the
  // dotted form lets that loopback through.
  const h = ipv6Hextets(address);
  if (!h) return true; // what cannot be read is not requested

  const zeros = (count: number) => h.slice(0, count).every((x) => x === 0);
  const embedded = (hi: number, lo: number) =>
    `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

  if (zeros(7) && (h[7] === 0 || h[7] === 1)) return true; // ::, ::1
  // IPv4 targets wearing an IPv6 hat: mapped (::ffff:a.b.c.d), compatible
  // (::a.b.c.d), translated (::ffff:0:a.b.c.d), NAT64 (64:ff9b::/96) and
  // 6to4 (2002::/16).
  if (zeros(5) && (h[5] === 0xffff || h[5] === 0))
    return isReservedIpv4(embedded(h[6], h[7]));
  if (zeros(4) && h[4] === 0xffff && h[5] === 0)
    return isReservedIpv4(embedded(h[6], h[7]));
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0))
    return isReservedIpv4(embedded(h[6], h[7]));
  if (h[0] === 0x2002) return isReservedIpv4(embedded(h[1], h[2]));

  if ((h[0] & 0xfe00) === 0xfc00) return true; // unique-local (fc00::/7)
  if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local (fe80::/10)
  if ((h[0] & 0xffc0) === 0xfec0) return true; // site-local (fec0::/10)
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  return false;
}

/** The eight 16-bit groups of an IPv6 literal, or null when it is not one. */
function ipv6Hextets(address: string): number[] | null {
  let host = address.toLowerCase();
  const zone = host.indexOf("%");
  if (zone !== -1) host = host.slice(0, zone);

  // A trailing dotted IPv4 part is two groups.
  const dotted = host.match(
    /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (dotted) {
    const octets = dotted.slice(2).map(Number);
    if (octets.some((n) => n > 255)) return null;
    host =
      dotted[1] +
      `${((octets[0] << 8) | octets[1]).toString(16)}:` +
      `${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = host.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [
    ...head,
    ...new Array<string>(halves.length === 2 ? missing : 0).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  const values = groups.map((g) =>
    /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN,
  );
  return values.some(Number.isNaN) ? null : values;
}
