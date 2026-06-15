const https = require('https');
const fs    = require('fs');

function req(url, opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(url, opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  // ── KST 오늘 날짜 ──────────────────────────────────────
  const kst     = new Date(Date.now() + 9 * 3600 * 1000);
  const today   = kst.toISOString().slice(0, 10);
  const days    = ['일','월','화','수','목','금','토'];
  const dayName = days[kst.getUTCDay()];
  const m       = kst.getUTCMonth() + 1;
  const d       = kst.getUTCDate();

  // ── 일정 읽기 ──────────────────────────────────────────
  let schedules = [];
  try { schedules = JSON.parse(fs.readFileSync('schedule.json', 'utf8')); }
  catch { console.log('schedule.json 없음 → 일정 없음 처리'); }

  const list = schedules
    .filter(s => s.date === today)
    .sort((a, b) => a.start.localeCompare(b.start));

  // ── 메시지 작성 ────────────────────────────────────────
  let text;
  if (!list.length) {
    text = `📅 ${m}월 ${d}일 (${dayName}) 상상우리\n\n오늘은 등록된 회의 일정이 없습니다 😊`;
  } else {
    const lines = [
      `📅 ${m}월 ${d}일 (${dayName}) 상상우리 회의 일정`,
      `총 ${list.length}건`,
      '─'.repeat(22)
    ];
    list.forEach((s, i) => {
      const time = s.end ? `${s.start} ~ ${s.end}` : s.start;
      lines.push(`\n${i + 1}. ${s.name}`);
      lines.push(`⏰ ${time}`);
      lines.push(`👤 ${s.person}`);
      if (s.memo) lines.push(`📌 ${s.memo}`);
    });
    text = lines.join('\n');
  }

  console.log('── 발송 메시지 ──\n' + text + '\n──────────────────');

  // ── 카카오 토큰 갱신 ───────────────────────────────────
  const tokenRes = await req(
    'https://kauth.kakao.com/oauth/token',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    `grant_type=refresh_token&client_id=${process.env.KAKAO_REST_API_KEY}&refresh_token=${process.env.KAKAO_REFRESH_TOKEN}`
  );
  const tokenData  = JSON.parse(tokenRes.body);
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    console.error('❌ 토큰 갱신 실패:', tokenRes.body);
    process.exit(1);
  }
  console.log('✅ 카카오 토큰 갱신 완료');

  // ── 나에게 보내기 ──────────────────────────────────────
  const template = JSON.stringify({
    object_type: 'text',
    text,
    link: {
      web_url: 'https://citiyong.github.io/sangsanguri-schedule/',
      mobile_web_url: 'https://citiyong.github.io/sangsanguri-schedule/'
    }
  });

  const sendRes = await req(
    'https://kapi.kakao.com/v2/api/talk/memo/default/send',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    },
    `template_object=${encodeURIComponent(template)}`
  );

  console.log('발송 결과:', sendRes.status, sendRes.body);
  if (sendRes.status !== 200) { console.error('❌ 발송 실패'); process.exit(1); }
  console.log('✅ 카카오톡 발송 완료!');
}

main().catch(e => { console.error(e); process.exit(1); });
