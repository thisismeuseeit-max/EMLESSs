async function test() {
  const login = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({username: 'admin', password: 'StrongPass!123'})
  });
  const cookie = login.headers.get('set-cookie');
  console.log('Login:', await login.json());

  const ping = await fetch('http://localhost:3000/api/configurations/ping-all', {
    method: 'POST',
    headers: { 'Cookie': cookie }
  });
  console.log('Ping All:', await ping.json());
}
test();
