import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const source = new URL(
  '../src/features/calls/components/in-call-contact-info.tsx',
  import.meta.url
);
const native = createRequire(source);
const React = native('react');
const { renderToStaticMarkup } = native('react-dom/server');

function fixture({ get, put, contactId = 'ana', deferStateUpdates = false }) {
  const states = [];
  const pendingStates = [];
  const effects = [];
  const pendingEffects = [];
  const requests = [];
  const notifications = [];
  const translators = new Map();
  let cursor = 0;
  let dirty = true;
  let tree;
  let nextId = 0;
  let profileUrls;
  const messages = Object.fromEntries(
    ['calls', 'contacts', 'common'].map((namespace) => [
      namespace,
      JSON.parse(
        fs.readFileSync(
          new URL(`../src/i18n/locales/en/${namespace}.json`, import.meta.url),
          'utf8'
        )
      )
    ])
  );
  const api = {
    get: async (url) => {
      requests.push({ method: 'GET', url });
      return get(url);
    },
    put: async (url, body) => {
      requests.push({ method: 'PUT', url, body });
      return put(url, body);
    }
  };
  const overrides = {
    react: {
      ...React,
      useId: () => `field-${nextId++}`,
      useState: (initial) => {
        const index = cursor++;
        if (!Object.hasOwn(states, index)) {
          states[index] = typeof initial === 'function' ? initial() : initial;
        }
        return [
          states[index],
          (value) => {
            const update = () => {
              const next =
                typeof value === 'function' ? value(states[index]) : value;
              if (!Object.is(next, states[index])) dirty = true;
              states[index] = next;
            };
            if (deferStateUpdates) {
              pendingStates.push(update);
              dirty = true;
            } else {
              update();
            }
          }
        ];
      },
      useEffect: (run, dependencies) => {
        const index = cursor++;
        const previous = effects[index];
        if (
          !previous ||
          dependencies.some(
            (value, position) =>
              !Object.is(value, previous.dependencies[position])
          )
        ) {
          pendingEffects.push(() => {
            previous?.cleanup?.();
            effects[index] = { dependencies, cleanup: run() };
          });
        }
      }
    },
    'next-intl': {
      useFormatter: () => ({
        number: (value, options) => {
          assert.ok(
            Number.isFinite(value),
            'Only finite amounts are formatted'
          );
          return new Intl.NumberFormat('en-US', options).format(value);
        }
      }),
      useTranslations: (namespace) => {
        if (!translators.has(namespace)) {
          translators.set(namespace, (key) => {
            const value = `${namespace}.${key}`
              .split('.')
              .reduce((current, part) => current?.[part], messages);
            assert.equal(
              typeof value,
              'string',
              `Missing translation: ${namespace}.${key}`
            );
            return value;
          });
        }
        return translators.get(namespace);
      }
    },
    '@ringee/frontend-shared/hooks/use.api': { useApi: () => api },
    '@ringee/frontend-shared/lib/api': { ApiError: class extends Error {} },
    '@ringee/frontend-shared/components/ui/button': { Button: 'button' },
    '@ringee/frontend-shared/components/ui/input': { Input: 'input' },
    '@ringee/frontend-shared/components/ui/label': { Label: 'label' },
    '@ringee/frontend-shared/components/ui/skeleton': { Skeleton: 'div' },
    '@ringee/frontend-shared/components/ui/scroll-area': { ScrollArea: 'div' },
    '@ringee/frontend-shared/components/external-profile-links': {
      ExternalProfileButtons: ({ urls }) => {
        profileUrls = urls;
        return null;
      }
    },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    sonner: {
      toast: {
        error: (message) => notifications.push({ type: 'error', message }),
        success: (message) => notifications.push({ type: 'success', message })
      }
    }
  };
  const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (name) => (Object.hasOwn(overrides, name) ? overrides[name] : native(name)),
    module,
    module.exports
  );

  function render() {
    let renders = 0;
    while (dirty) {
      assert.ok(++renders < 20, 'Component effects must settle');
      pendingStates.splice(0).forEach((update) => update());
      dirty = false;
      cursor = 0;
      tree = module.exports.InCallContactInfo({ contactId });
      pendingEffects.splice(0).forEach((run) => run());
    }
    return tree;
  }

  render();
  return {
    requests,
    notifications,
    externalUrls: () => profileUrls,
    html: () => renderToStaticMarkup(render()),
    settle: async () => {
      await new Promise(setImmediate);
      render();
    },
    setContactId: (id) => {
      contactId = id;
      dirty = true;
      render();
    },
    click: async (label) => {
      const button = findNode(
        render(),
        (node) =>
          node.type === 'button' &&
          renderToStaticMarkup(node).replace(/<[^>]*>/g, '') === label
      );
      assert.ok(button, `Button not found: ${label}`);
      await button.props.onClick();
      render();
    },
    change: (label, value) => {
      const field = findNode(
        render(),
        (node) => node.props.label === label && node.props.onChange
      );
      assert.ok(field, `Field not found: ${label}`);
      const input = findNode(field, (node) => node.type === 'input');
      input.props.onChange({ target: { value } });
      render();
    }
  };
}

function findNode(tree, matches) {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findNode(child, matches);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(tree)) return null;
  if (matches(tree)) return tree;
  return findNode(
    typeof tree.type === 'function'
      ? tree.type(tree.props)
      : tree.props.children,
    matches
  );
}

function importedLead() {
  return {
    id: 'ana',
    name: 'Ana Moreno',
    firstName: 'Ana',
    lastName: 'Moreno',
    phoneNumber: '+14155550100',
    email: 'ana@acme.example',
    company: 'Acme Labs',
    jobTitle: 'Sales director',
    headline: 'Builds growing sales teams',
    summary: 'Expanding into the Caribbean this quarter',
    seniority: 'Director',
    department: 'Sales',
    yearsExperience: 0,
    locationCity: 'Santo Domingo',
    locationRegion: 'Distrito Nacional',
    locationCountry: 'Dominican Republic',
    locationPostalCode: '10101',
    timezone: 'America/Santo_Domingo',
    languages: ['Spanish', 'English'],
    skills: ['Negotiation', 'Forecasting'],
    interests: ['Sailing'],
    linkedinUrl: 'https://www.linkedin.com/in/ana-moreno',
    source: 'Imported prospect list',
    status: 'qualified',
    lifecycleStage: 'opportunity',
    score: 0,
    emailVerified: false,
    phoneVerified: true,
    customFields: {
      'Pain point': 'Manual lead assignment',
      'Ready to buy': false,
      'Latest budget': 0,
      'Buying committee': {
        'Decision maker': 'Laura Perez',
        Requirements: ['CRM integration', 'Local phone numbers']
      },
      Empty: { Missing: null, Blank: '   ', Items: [] }
    },
    education: [
      { school: 'Caribbean University', degree: 'MBA', startYear: 2015 }
    ],
    workHistory: [
      { company: 'Previous Ventures', title: 'Account manager', current: false }
    ],
    phones: [{ id: 'phone', phone: '+18095550101', type: 'mobile' }],
    emails: [
      { id: 'email', email: 'ana.personal@example.com', type: 'personal' }
    ],
    tags: [{ tag: { id: 'tag', name: 'High intent' } }],
    notes: [
      { id: 'note', content: 'Ask about the CRM migration before pricing' }
    ],
    affiliations: [
      {
        id: 'affiliation',
        role: 'Regional director',
        isPrimary: true,
        company: {
          name: 'Acme Caribbean',
          industry: 'Software',
          subIndustry: 'Sales automation',
          companyType: 'Private company',
          description: 'Customer engagement software',
          employeeCount: 48,
          annualRevenue: '123456789',
          fundingTotal: 0,
          technologies: ['HubSpot', 'PostgreSQL'],
          contactEmail: 'sales@acme-caribbean.example',
          hqStreet: '32 Main Street',
          hqCity: 'Santiago',
          hqPostalCode: '51000',
          hqCountry: 'Dominican Republic',
          twitterUrl: 'https://x.com/acmecaribbean',
          customFields: { 'Renewal month': 'November' }
        }
      }
    ]
  };
}

test('an imported lead shows sales context, enrichment, secondary contacts and company details', async () => {
  const f = fixture({ get: async () => importedLead() });
  await f.settle();
  const html = f.html();
  for (const value of [
    'Ana Moreno',
    'Sales director',
    'Builds growing sales teams',
    'Expanding into the Caribbean this quarter',
    'Director',
    'Spanish',
    'English',
    'Negotiation',
    'Forecasting',
    'Sailing',
    'Santo Domingo',
    'Distrito Nacional',
    '10101',
    'America/Santo_Domingo',
    'https://www.linkedin.com/in/ana-moreno',
    'Imported prospect list',
    'qualified',
    'opportunity',
    '+18095550101',
    'ana.personal@example.com',
    'High intent',
    'Ask about the CRM migration before pricing',
    'Acme Caribbean',
    'Regional director',
    'Software',
    'Sales automation',
    'Private company',
    'Customer engagement software',
    '$1,234,567.89',
    '$0.00',
    'HubSpot',
    'PostgreSQL',
    'sales@acme-caribbean.example',
    '32 Main Street',
    'Santiago, 51000, Dominican Republic',
    'https://x.com/acmecaribbean',
    'Renewal month',
    'November',
    'Caribbean University',
    'MBA',
    'Previous Ventures',
    'Account manager'
  ]) {
    assert.ok(html.includes(value), `Missing lead information: ${value}`);
  }
  assert.doesNotMatch(html, /<input/);
  assert.deepEqual(f.requests, [{ method: 'GET', url: '/contacts/ana' }]);
});

test('company currency preserves zero cents and omits absent or invalid amounts', async () => {
  for (const value of [
    0,
    '0',
    null,
    undefined,
    '',
    '   ',
    NaN,
    Infinity,
    'unknown'
  ]) {
    const lead = importedLead();
    Object.assign(lead.affiliations[0].company, {
      annualRevenue: value,
      fundingTotal: value
    });
    const f = fixture({ get: async () => lead });
    await f.settle();
    const html = f.html();
    if (value === 0 || value === '0') {
      assert.match(html, /Annual revenue<\/dt><dd[^>]*>\$0\.00<\/dd>/);
      assert.match(html, /Total funding<\/dt><dd[^>]*>\$0\.00<\/dd>/);
    } else {
      assert.doesNotMatch(
        html,
        /Annual revenue|Total funding|NaN|Infinity|unknown/
      );
    }
  }
});

test('custom data preserves nested names, arrays, zero and false while omitting empty values', async () => {
  const f = fixture({ get: async () => importedLead() });
  await f.settle();
  const html = f.html();
  for (const value of [
    'Pain point',
    'Manual lead assignment',
    'Buying committee',
    'Decision maker',
    'Laura Perez',
    'Requirements',
    'CRM integration',
    'Local phone numbers'
  ]) {
    assert.ok(html.includes(value), `Missing custom field: ${value}`);
  }
  assert.match(html, /Ready to buy<\/dt><dd[^>]*>No<\/dd>/);
  assert.match(html, /Latest budget<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(html, /Score<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(html, /Years of experience<\/dt><dd[^>]*>0<\/dd>/);
  assert.doesNotMatch(
    html,
    /\[object Object\]|>Empty<|>Missing<|>Blank<|>Items</
  );
});

test('sparse contacts do not display empty information sections', async () => {
  const f = fixture({
    get: async () => ({
      id: 'ana',
      phoneNumber: '+14155550100',
      skills: [],
      languages: [],
      customFields: { Blank: '', Missing: null, Nested: { Empty: [] } },
      education: [],
      workHistory: [],
      affiliations: [],
      notes: []
    })
  });
  await f.settle();
  const html = f.html();
  assert.match(html, /\+14155550100/);
  assert.equal((html.match(/<section /g) ?? []).length, 1);
  assert.doesNotMatch(html, />Blank<|>Missing<|>Nested<|>Empty<|<input/);
});

test('saving editable fields preserves imported custom data and fetched relationships', async () => {
  const lead = importedLead();
  const f = fixture({
    get: async () => lead,
    put: async (_url, body) => ({
      id: lead.id,
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      phoneNumber: body.phoneNumber,
      email: body.email,
      company: body.organization,
      jobTitle: body.jobTitle
    })
  });
  await f.settle();
  await f.click('Edit');
  f.change('First name', 'Ann');
  f.change('Display name', 'Ann Moreno');
  await f.click('Save');
  const html = f.html();
  for (const value of [
    'Ann Moreno',
    'Pain point',
    'Manual lead assignment',
    '+18095550101',
    'ana.personal@example.com',
    'High intent',
    'Ask about the CRM migration before pricing',
    'Acme Caribbean',
    'Caribbean University'
  ]) {
    assert.ok(
      html.includes(value),
      `Contact detail lost after saving: ${value}`
    );
  }
  const saved = f.requests.find(({ method }) => method === 'PUT');
  assert.equal(saved.url, '/contacts/ana');
  assert.equal(saved.body.firstName, 'Ann');
  assert.equal(Object.hasOwn(saved.body, 'customFields'), false);
  assert.equal(Object.hasOwn(saved.body, 'affiliations'), false);
  assert.doesNotMatch(html, /<input/);
  assert.equal(f.notifications.at(-1).type, 'success');
});

test('switching contacts clears the previous details and editing state, including a failed load', async () => {
  let rejectNext;
  const f = fixture({
    get: (url) =>
      url === '/contacts/ana'
        ? Promise.resolve(importedLead())
        : new Promise((_resolve, reject) => {
            rejectNext = reject;
          })
  });
  await f.settle();
  await f.click('Edit');
  f.change('First name', 'Unsaved first name');
  f.setContactId('bea');
  assert.doesNotMatch(
    f.html(),
    /Ana|Unsaved first name|Manual lead assignment/
  );
  rejectNext(new Error('Contact unavailable'));
  await f.settle();
  const html = f.html();
  assert.match(html, /No contact information was found/);
  assert.doesNotMatch(
    html,
    /Ana|Unsaved first name|Manual lead assignment|<input/
  );
  assert.equal(f.notifications.at(-1).type, 'error');
});

test('a late previous contact response cannot replace the current lead', async () => {
  const resolve = new Map();
  const f = fixture({
    get: (url) =>
      new Promise((complete) => {
        resolve.set(url, complete);
      })
  });
  f.setContactId('bea');
  resolve.get('/contacts/bea')({
    id: 'bea',
    name: 'Bea Current',
    phoneNumber: '+18095550102'
  });
  await f.settle();
  resolve.get('/contacts/ana')(importedLead());
  await f.settle();
  const html = f.html();
  assert.match(html, /Bea Current/);
  assert.doesNotMatch(html, /Ana Moreno|Manual lead assignment/);
});

test('null or undefined contact responses show the empty state without crashing', async () => {
  for (const response of [null, undefined]) {
    const f = fixture({ get: async () => response });
    await f.settle();
    const html = f.html();
    assert.match(html, /No contact information was found/);
    assert.doesNotMatch(html, /<input|<section/);
  }
});

test('missing optional scalar fields and relation lists remain safe to view and edit', async () => {
  const optionalFields = [
    ...Object.keys(importedLead()).filter(
      (key) => key !== 'id' && key !== 'phoneNumber'
    ),
    'middleName',
    'fullName',
    'organization',
    'locationCountryCode',
    'websiteUrl',
    'twitterUrl',
    'githubUrl',
    'facebookUrl',
    'instagramUrl',
    'youtubeUrl',
    'tiktokUrl',
    'blogUrl',
    'calendlyUrl',
    'birthday',
    'gender',
    'maritalStatus',
    'doNotCall',
    'unsubscribed',
    'revenue',
    'companySize'
  ];
  for (const value of [null, undefined]) {
    const f = fixture({
      get: async () => ({
        id: 'ana',
        phoneNumber: '+14155550100',
        ...Object.fromEntries(optionalFields.map((key) => [key, value]))
      })
    });
    await f.settle();
    assert.match(f.html(), /\+14155550100/);
    await f.click('Edit');
    assert.match(f.html(), /<input/);
    await f.click('Cancel');
    assert.doesNotMatch(f.html(), /<input|>null<|>undefined</);
  }
});

test('contacts without a name or phone render a fallback and keep phone validation editable', async () => {
  for (const phoneNumber of [null, undefined]) {
    const f = fixture({ get: async () => ({ id: 'ana', phoneNumber }) });
    await f.settle();
    assert.match(f.html(), /<h3[^>]*>Contact Information<\/h3>/);
    await f.click('Edit');
    assert.match(f.html(), /Phone<\/label><input[^>]*value=""/);
    await f.click('Save');
    assert.deepEqual(f.notifications, [
      { type: 'error', message: 'Phone number is required' }
    ]);
    assert.equal(f.requests.filter(({ method }) => method === 'PUT').length, 0);
    assert.match(f.html(), /<input/);
    f.change('Phone', '+18095550102');
    assert.match(f.html(), /value="\+18095550102"/);
  }
});

for (const [field, expected] of [
  ['phones', '+18095550101'],
  ['emails', 'ana.personal@example.com'],
  ['tags', 'High intent'],
  ['notes', 'Ask about the CRM migration before pricing']
]) {
  test(`incomplete ${field} entries do not hide valid lead information or crash`, async () => {
    const lead = importedLead();
    lead[field] = [null, undefined, {}, { tag: null }, ...lead[field]];
    const f = fixture({ get: async () => lead });
    await f.settle();
    const html = f.html();
    assert.ok(html.includes(expected));
    assert.match(html, /Ana Moreno|Manual lead assignment/);
    assert.doesNotMatch(html, />null<|>undefined<|\[object Object\]/);
  });
}

test('nullable or incomplete affiliations before a valid company preserve its information and profile link', async () => {
  for (const first of [
    null,
    undefined,
    {},
    { company: null },
    { company: undefined }
  ]) {
    const lead = importedLead();
    lead.affiliations[0].company.linkedinUrl =
      'https://www.linkedin.com/company/acme-caribbean';
    lead.affiliations = [first, ...lead.affiliations];
    const f = fixture({ get: async () => lead });
    await f.settle();
    const html = f.html();
    assert.match(html, /Acme Caribbean/);
    assert.match(html, /Regional director/);
    assert.match(html, /sales@acme-caribbean\.example/);
    assert.equal(
      f.externalUrls().companyLinkedinUrl,
      'https://www.linkedin.com/company/acme-caribbean'
    );
  }
});

test('companies without a name or id preserve the affiliation role with a safe heading', async () => {
  for (const company of [{}, { name: null }]) {
    const lead = importedLead();
    lead.affiliations = [{ company, role: 'Advisory partner' }];
    const f = fixture({ get: async () => lead });
    await f.settle();
    const html = f.html();
    assert.match(html, /<h4[^>]*>Company<\/h4>/);
    assert.match(html, /Advisory partner/);
    assert.doesNotMatch(html, />null<|>undefined</);
  }
});

test('null or undefined saves preserve the contact and unsaved form so the user can retry', async () => {
  for (const invalidResponse of [null, undefined]) {
    const lead = importedLead();
    let retry = false;
    const f = fixture({
      deferStateUpdates: true,
      get: async () => lead,
      put: async (_url, body) =>
        retry
          ? { id: lead.id, name: body.name, phoneNumber: body.phoneNumber }
          : invalidResponse
    });
    await f.settle();
    await f.click('Edit');
    f.change('Display name', 'Edited Ana');
    await f.click('Save');
    const failed = f.html();
    assert.match(failed, /Ana Moreno/);
    assert.match(failed, /value="Edited Ana"/);
    assert.match(failed, /Manual lead assignment/);
    assert.match(failed, /<input/);
    assert.deepEqual(
      f.notifications.map(({ type }) => type),
      ['error']
    );
    retry = true;
    await f.click('Save');
    const saved = f.html();
    assert.match(saved, /Edited Ana/);
    assert.match(saved, /Manual lead assignment/);
    assert.doesNotMatch(saved, /<input/);
    assert.deepEqual(
      f.notifications.map(({ type }) => type),
      ['error', 'success']
    );
    assert.equal(f.requests.filter(({ method }) => method === 'PUT').length, 2);
  }
});
