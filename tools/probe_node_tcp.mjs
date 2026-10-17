import net from 'node:net';

const port = Number(process.argv[2] ?? 15318);
const connection = net.createConnection({ host: '127.0.0.1', port });
connection.setTimeout(5000);
connection.on('connect', () => connection.write('who\n'));
connection.on('data', (data) => {
  const response = data.toString('utf8').trim();
  console.log(response);
  connection.end();
  if (!response.startsWith('991 ')) process.exitCode = 1;
});
connection.on('timeout', () => connection.destroy(new Error('Pike response timed out')));
connection.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
