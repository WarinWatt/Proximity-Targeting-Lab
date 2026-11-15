// Run exclusively against the disposable release stack after migration 005.
// ACCOUNT_HTTP_TEST=1 node bin/test-accounts-http.mjs
// Unique fixtures remain for inspection. Other owners' active flags are restored.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';

assert.equal(process.env.ACCOUNT_HTTP_TEST, '1', 'Opt in with ACCOUNT_HTTP_TEST=1');
const base = new URL(process.env.ACCOUNT_TEST_URL ?? 'http://127.0.0.1:8090/');
assert.equal(base.href, 'http://127.0.0.1:8090/', 'Only disposable loopback port 8090 is supported');
const web = 'proximity-release-web-1', database = 'proximity-release-db-1';
const inspected = JSON.parse(execFileSync('docker', ['inspect', web, database], {encoding: 'utf8'}));
for (const [index, instance] of inspected.entries()) {
  assert.equal(instance.Config.Labels['com.docker.compose.project'], 'proximity-release');
  assert.equal(instance.Config.Labels['com.docker.compose.service'], index === 0 ? 'web' : 'db');
  assert.equal(instance.State.Running, true);
}
assert.ok(inspected[0].NetworkSettings.Ports['80/tcp'].some(port => port.HostIp === '127.0.0.1' && port.HostPort === '8090'));
assert.ok(inspected[0].Config.Env.includes('PROXIMITY_DB_HOST=db'));
assert.ok(Object.keys(inspected[0].NetworkSettings.Networks).some(name =>
  Object.hasOwn(inspected[1].NetworkSettings.Networks, name)), 'Release web and DB must share a network');

const prefix = `acct-${randomBytes(6).toString('hex')}`;
const password = `Acct!${randomBytes(20).toString('hex')}`;
const replacementPassword = `Next!${randomBytes(20).toString('hex')}`;
function sql(code) {
  const bootstrap = `<?php if(getenv('PROXIMITY_DB_HOST')!=='db')throw new RuntimeException('Unexpected DB host');$db=new PDO('mysql:host=db;dbname=proximity_lab;charset=utf8mb4','root',getenv('MARIADB_ROOT_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);`;
  return execFileSync('docker', ['exec', '-i', web, 'php'], {input: bootstrap + code, encoding: 'utf8', timeout: 20000}).trim();
}
function noSecrets(data) {
  function visit(value) {
    if (typeof value === 'string') {
      assert.ok(!value.includes(password) && !value.includes(replacementPassword), 'Response leaked a fixture password');
      assert.ok(!/^\$(?:2[aby]\$|argon2)/.test(value), 'Response leaked a password hash');
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        assert.ok(!/^(?:password|password_hash|current_password|password_digest)$/i.test(key), `Sensitive response field: ${key}`);
        visit(child);
      }
    }
  }
  visit(data);
}
function expect(result, status, label) {
  assert.equal(result.status, status, `${label}: expected ${status}, got ${result.status}`);
  return result.data;
}
function denied(result, label, statuses = [401, 403]) {
  assert.ok(statuses.includes(result.status), `${label}: expected denial, got ${result.status}`);
}
async function client(identity, secret = password, role) {
  let cookie = '', csrf = '';
  const call = async (action, body, extra = {}) => {
    const response = await fetch(new URL(`api.php?action=${action}`, base), {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: {Cookie: cookie, ...(body === undefined ? {} : {Origin: base.origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}), ...extra},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(15000)
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
    let data;
    try { data = await response.json(); } catch { throw new Error(`${action}: non-JSON response (${response.status})`); }
    noSecrets(data);
    if (data.csrf) csrf = data.csrf;
    return {status: response.status, data};
  };
  expect(await call('session'), 200, 'initial session');
  if (identity) expect(await call('login', {username: identity.username, password: secret, ...(role ? {role} : {})}), 200, 'fixture login');
  return call;
}
const passed = [];
async function check(label, fn) {
  // Validation probes intentionally consume rate limits; isolate each group.
  sql('$db->exec("DELETE FROM auth_rate_limits");');
  await fn(); passed.push(label); console.log(`PASS ${label}`);
}
const userOf = data => data.user ?? data.profile ?? data;
const profile = async call => userOf(expect(await call('profile'), 200, 'own profile'));
const save = (identity, roles, extra = {}) => ({id: identity.id, username: identity.username,
  display_name: identity.username, email: `${identity.username}@example.invalid`, roles, active: true, ...extra});

// Fail before any mutation if migration 005 has not created the account contract.
sql("$db->query('SELECT id,username,display_name,email,active FROM users LIMIT 0');$db->query('SELECT user_id,role FROM user_roles LIMIT 0');");
// Disposable environment only; other suites share this source IP. Run exclusively.
sql('$db->exec("DELETE FROM auth_rate_limits");');
const identities = JSON.parse(sql(`
$columns=$db->query('SHOW COLUMNS FROM users')->fetchAll(PDO::FETCH_COLUMN);
$out=[];$db->beginTransaction();
foreach(['owner','customer','other','multi','victim'] as $name){
 $role=$name==='owner'?'owner':'customer';$username='${prefix}-'.$name;
 $values=['username'=>$username,'password_hash'=>password_hash('${password}',PASSWORD_DEFAULT),'role'=>$role,'display_name'=>$username,'email'=>$username.'@example.invalid','active'=>1];
 if(in_array('is_demo',$columns,true))$values['is_demo']=0;
 $q=$db->prepare('INSERT INTO users('.implode(',',array_keys($values)).') VALUES ('.implode(',',array_fill(0,count($values),'?')).')');$q->execute(array_values($values));
 $id=(int)$db->lastInsertId();$db->prepare('INSERT INTO user_roles(user_id,role) VALUES (?,?)')->execute([$id,$role]);
 $out[$name]=['id'=>$id,'username'=>$username];
}
$db->commit();echo json_encode($out);`));
console.log(`Disposable account fixtures: ${prefix}`);
const owner = await client(identities.owner), customer = await client(identities.customer);
const other = await client(identities.other), anonymous = await client();

await check('public register validation, CSRF and duplicate identities', async () => {
  const valid = {username: `${prefix}-registered`, display_name: 'Account HTTP fixture', email: `${prefix}-registered@example.invalid`, password};
  expect(await anonymous('register', valid, {'X-CSRF-Token': 'invalid'}), 403, 'registration CSRF');
  for (const change of [{username: 'x'}, {username: 'invalid username'}, {username: 'x'.repeat(100)},
    {email: 'not-an-email'}, {password: 'short'}, {password: '12345678901'}]) {
    expect(await anonymous('register', {...valid, ...change}), 422, 'registration validation');
  }
  const result = await anonymous('register', valid);
  assert.ok([200, 201].includes(result.status), `registration returned ${result.status}`);
  // Email must be valid; the contract does not require email uniqueness.
  for (const change of [{}, {email: `${prefix}-duplicate-user@example.invalid`}]) {
    const fresh = await client();
    const duplicate = await fresh('register', {...valid, ...change});
    assert.ok([409, 422].includes(duplicate.status), `duplicate identity returned ${duplicate.status}`);
  }
  const registered = await client({username: valid.username});
  const user = userOf(expect(await registered('session'), 200, 'registered session'));
  assert.equal(user.role, 'customer'); assert.deepEqual([...user.roles].sort(), ['customer']);
});

await check('register cannot self-assign privileged roles', async () => {
  const fresh = await client();
  const username = `${prefix}-escalate`;
  const result = await fresh('register', {username, display_name: 'Escalation probe', email: `${username}@example.invalid`, password,
    role: 'owner', roles: ['customer', 'owner', 'operator'], active: true, is_demo: false});
  assert.ok([200, 201, 403, 422].includes(result.status), `escalation registration returned ${result.status}`);
  if ([200, 201].includes(result.status)) {
    const account = await client({username});
    const user = userOf(expect(await account('session'), 200, 'self-registration session'));
    assert.equal(user.role, 'customer'); assert.deepEqual([...user.roles].sort(), ['customer']);
    denied(await account('users'), 'self-registration owner access');
    denied(await account('role-switch', {role: 'owner'}), 'self-registration role switch');
  }
});

await check('directory and account administration are owner-only with no credential leaks', async () => {
  denied(await anonymous('users'), 'anonymous directory');
  for (const call of [customer, other]) {
    denied(await call('users'), 'customer directory');
    denied(await call('user-save', save(identities.owner, ['customer'])), 'customer role assignment');
  }
  const directory = expect(await owner('users'), 200, 'owner directory');
  assert.ok(Array.isArray(directory.users), 'users endpoint must return {users:[]}');
  assert.ok(directory.users.some(user => Number(user.id) === identities.customer.id));
  expect(await owner('user-save', save(identities.multi, ['customer', 'unknown-role'])), 422, 'invalid role');
  const username = `${prefix}-owner-created`;
  const created = await owner('user-save', {username, display_name: 'Owner created fixture', email: `${username}@example.invalid`, password, roles: ['customer'], active: true});
  assert.ok([200, 201].includes(created.status), `owner creation returned ${created.status}`);
  const createdClient = await client({username});
  assert.equal(userOf(expect(await createdClient('session'), 200, 'created account session')).role, 'customer');
});

await check('profile ownership, privilege fields and password verification', async () => {
  const beforeOwner = await profile(owner), beforeOther = await profile(other);
  const probe = await customer('profile', {id: identities.owner.id, user_id: identities.other.id, display_name: 'Own profile update',
    email: `${prefix}-own-update@example.invalid`, roles: ['owner'], role: 'owner', active: false});
  assert.ok([200, 403, 422].includes(probe.status), `profile field protection returned ${probe.status}`);
  assert.deepEqual(await profile(owner), beforeOwner, 'profile write modified another owner');
  assert.deepEqual(await profile(other), beforeOther, 'profile write modified another customer');
  const own = await profile(customer);
  assert.equal(Number(own.id), identities.customer.id);
  const session = userOf(expect(await customer('session'), 200, 'profile session'));
  assert.equal(session.role, 'customer'); assert.deepEqual([...session.roles].sort(), ['customer']);
  denied(await customer('profile', {display_name: 'Customer', email: `${prefix}-own-update@example.invalid`, password: replacementPassword}), 'password requires current password', [400, 401, 403, 409, 422]);
  denied(await customer('profile', {display_name: 'Customer', email: `${prefix}-own-update@example.invalid`, password: replacementPassword, current_password: 'incorrect-current'}), 'incorrect current password', [400, 401, 403, 409, 422]);
  await client(identities.customer);
  expect(await customer('profile', {display_name: 'Updated Customer', email: `${prefix}-own-update@example.invalid`, password: replacementPassword, current_password: password}), 200, 'own password change');
  const fresh = await client();
  expect(await fresh('login', {username: identities.customer.username, password}), 401, 'old password rejected');
  await client(identities.customer, replacementPassword);
});

await check('owner assigns multiple roles; switches enforce current grants', async () => {
  expect(await owner('user-save', save(identities.multi, ['customer', 'operator'])), 200, 'assign multiple roles');
  const multi = await client(identities.multi, password, 'customer');
  let user = userOf(expect(await multi('session'), 200, 'multi-role session'));
  assert.deepEqual([...user.roles].sort(), ['customer', 'operator']); assert.equal(user.role, 'customer');
  denied(await multi('system-health'), 'customer active role denies operator health');
  expect(await multi('role-switch', {role: 'operator'}), 200, 'allowed role switch');
  user = userOf(expect(await multi('session'), 200, 'switched session')); assert.equal(user.role, 'operator');
  expect(await multi('system-health'), 200, 'operator health');
  denied(await multi('users'), 'operator directory');
  denied(await multi('role-switch', {role: 'owner'}), 'unassigned role switch');
  assert.equal(userOf(expect(await multi('session'), 200, 'denied switch preserves role')).role, 'operator');
  const unassigned = await client();
  denied(await unassigned('login', {username: identities.multi.username, password, role: 'owner'}), 'login cannot select unassigned role');
  expect(await owner('user-save', save(identities.multi, ['customer'])), 200, 'revoke operator grant');
  denied(await multi('system-health'), 'revoked role affects existing session');
  denied(await multi('role-switch', {role: 'operator'}), 'revoked role cannot be restored by session');
});

await check('deactivation invalidates existing sessions on every protected request', async () => {
  const actions = ['profile', 'wallet', 'stations'];
  const sessions = await Promise.all(actions.map(() => client(identities.victim)));
  expect(await owner('user-save', save(identities.victim, ['customer'], {active: false})), 200, 'deactivate fixture');
  for (const [index, action] of actions.entries()) denied(await sessions[index](action), `inactive session ${action}`);
  const fresh = await client();
  denied(await fresh('login', {username: identities.victim.username, password}), 'inactive login');
  const snapshot = expect(await sessions[0]('session'), 200, 'inactive public session');
  assert.equal(snapshot.user, null, 'inactive user must not remain authenticated');
});

await check('last active real owner cannot be deactivated or stripped of owner', async () => {
  // Exclusive suite: restore exact flags even when an assertion fails.
  const otherOwners = JSON.parse(sql(`$q=$db->prepare("SELECT DISTINCT u.id,u.active FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='owner' AND u.id<>?");$q->execute([${identities.owner.id}]);echo json_encode($q->fetchAll(PDO::FETCH_ASSOC));`));
  try {
    sql(`$q=$db->prepare("UPDATE users u JOIN user_roles r ON r.user_id=u.id SET u.active=0 WHERE r.role='owner' AND u.id<>?");$q->execute([${identities.owner.id}]);`);
    for (const extra of [{active: false}, {roles: ['customer']}]) {
      denied(await owner('user-save', save(identities.owner, ['owner'], extra)), 'last owner guard', [403, 409, 422]);
      expect(await owner('users'), 200, 'last owner remains usable');
    }
    assert.equal(Number(sql(`echo $db->query('SELECT active FROM users WHERE id=${identities.owner.id}')->fetchColumn();`)), 1);
    assert.equal(Number(sql(`echo $db->query("SELECT COUNT(*) FROM user_roles WHERE user_id=${identities.owner.id} AND role='owner'")->fetchColumn();`)), 1);
  } finally {
    const encoded = Buffer.from(JSON.stringify(otherOwners)).toString('base64');
    sql(`$rows=json_decode(base64_decode('${encoded}'),true,512,JSON_THROW_ON_ERROR);$q=$db->prepare('UPDATE users SET active=? WHERE id=?');foreach($rows as $row)$q->execute([(int)$row['active'],(int)$row['id']]);`);
  }
});
console.log(`Account HTTP acceptance passed (${passed.length} groups). Fixture prefix: ${prefix}`);
