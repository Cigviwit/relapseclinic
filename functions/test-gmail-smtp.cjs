const nodemailer = require('nodemailer');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const settings = JSON.parse(input);
    if (settings.enabled !== true || !settings.user || !settings.appPassword) {
      throw new Error('Gmail SMTP secret is incomplete or disabled');
    }
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: settings.user, pass: settings.appPassword },
      connectionTimeout: 20000, greetingTimeout: 10000, socketTimeout: 30000,
    });
    const result = await transport.sendMail({
      from: { name: 'RelapseClinic', address: settings.user }, to: settings.user,
      subject: 'RelapseClinic doctor digest SMTP test',
      text: 'Gmail SMTP is connected. This test contains no patient information.',
    });
    if (!result.accepted?.some((address) => address.toLowerCase() === settings.user.toLowerCase())) {
      throw new Error('Gmail did not accept the test recipient');
    }
    process.stdout.write('Gmail accepted the test email.\n');
  } catch (error) {
    process.stderr.write(`SMTP test failed: ${error.message}\n`);
    process.exitCode = 1;
  }
});
