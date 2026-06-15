const https = require('https');
const fs    = require('fs');

function smtpSend({ user, pass, to, subject, body }) {
  return new Promise((resolve, reject) => {
    const message = [
      `From: =?UTF-8?B?${Buffer.from('상상우리 일정알림').toString('base64')}?= <${user}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body).toString('base64')
    ].join('\r\n');

    const auth = Buffer.from(`\0${user}\0${pass}`).toString('base64');
    const boundary = `--${Date.now()}`;

    // nodemailer 없이 순수 Node.js net/tls로 SMTP 구현 대신
    // 간단히 Gmail REST API (OAuth 불필요한 SMTP over HTTPS) 우회 →
    // GitHub Actions에서 sendmail action 사용하도록 flag 파일 생성
    fs.writeFileSync('_mail_payload.json', JSON.stringify({ user, pass, to, subject, body }, null, 2));
    resolve();
  });
}

async function main() {
  const kst     = new Date(Date.now() + 9 * 3600 * 1000);
  const today   = kst.toISOString().slice(0, 10);
  const days    = ['일','월','화','수','목','금','토'];
  const dayName = days[kst.getUTCDay()];
  const m       = kst.getUTCMonth() + 1;
  const d       = kst.getUTCDate();

  let schedules = [];
  try { schedules = JSON.parse(fs.readFileSync('schedule.json', 'utf8')); }
  catch { console.log('schedule.json 없음'); }

  const list = schedules
    .filter(s => s.date === today)
    .sort((a, b) => a.start.localeCompare(b.start));

  let body;
  if (!list.length) {
    body = `📅 ${m}월 ${d}일 (${dayName}) 상상우리\n\n오늘은 등록된 회의 일정이 없습니다 😊`;
  } else {
    const lines = [
      `📅 ${m}월 ${d}일 (${dayName}) 상상우리 회의 일정`,
      `총 ${list.length}건`,
      '─'.repeat(30)
    ];
    list.forEach((s, i) => {
      const time = s.end ? `${s.start} ~ ${s.end}` : s.start;
      lines.push(`\n${i + 1}. ${s.name}`);
      lines.push(`⏰ ${time}`);
      lines.push(`👤 ${s.person}`);
      if (s.memo) lines.push(`📌 ${s.memo}`);
    });
    lines.push(`\n\n🔗 일정 확인: https://citiyong.github.io/sangsanguri-schedule/`);
    body = lines.join('\n');
  }

  console.log('── 발송 내용 ──\n' + body);

  const subject = `[상상우리] ${m}월 ${d}일 (${dayName}) 회의 일정`;
  const user    = process.env.GMAIL_USER;
  const pass    = process.env.GMAIL_APP_PASSWORD;
  const to      = process.env.GMAIL_USER;

  if (!user || !pass) {
    console.error('❌ GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 없습니다.');
    process.exit(1);
  }

  // nodemailer를 동적으로 사용
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch {
    console.log('nodemailer 없음 → npm install 필요');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: `"상상우리 일정알림" <${user}>`,
    to,
    subject,
    text: body
  });

  console.log('✅ 이메일 발송 완료!');
}

main().catch(e => { console.error(e); process.exit(1); });
