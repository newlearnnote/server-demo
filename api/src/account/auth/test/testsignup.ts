import * as nodemailer from 'nodemailer';

async function testMail() {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'your_gmail@gmail.com',
      pass: '앱비밀번호',
    },
  });

  await transporter.sendMail({
    from: 'your_gmail@gmail.com',
    to: '받는사람@naver.com',
    subject: '테스트',
    text: '테스트 메일입니다.',
  });
}

testMail().catch(console.error);