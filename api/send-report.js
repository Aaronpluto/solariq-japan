// Vercel Serverless Function: Send simulation report via email using Resend

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const RESEND_KEY = process.env.RESEND_API_KEY || 're_Ch9SKXwn_4TJJhbwVuki66biZwRq3ormY';

  try {
    const { email, report } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Build HTML email
    const html = buildReportEmail(report);

    // Send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SolarIQ <onboarding@resend.dev>',
        to: email,
        subject: '【SolarIQ】太陽光発電シミュレーション結果レポート',
        html: html,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Email send failed', detail: err });
    }

    const result = await response.json();
    return res.status(200).json({ success: true, id: result.id });

  } catch (err) {
    console.error('Send report error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function buildReportEmail(r) {
  if (!r) return '<p>レポートデータがありません</p>';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a2e">
  <div style="text-align:center;padding:20px 0;border-bottom:2px solid #f59e0b">
    <h1 style="margin:0;font-size:24px">☀ Solar<span style="color:#f59e0b">IQ</span></h1>
    <p style="color:#666;font-size:12px;margin:4px 0">太陽光発電シミュレーション結果レポート</p>
  </div>

  <div style="margin:24px 0">
    <h2 style="font-size:16px;color:#1e3a5f;border-bottom:1px solid #eee;padding-bottom:8px">📍 対象建物</h2>
    <p style="font-size:14px">${r.address || '—'}</p>
    <p style="font-size:12px;color:#666">屋上面積: ${r.area || '—'}m² / システム容量: ${r.sysKW || '—'}kW / パネル枚数: ${r.panels || '—'}枚</p>
  </div>

  <div style="margin:24px 0">
    <h2 style="font-size:16px;color:#1e3a5f;border-bottom:1px solid #eee;padding-bottom:8px">⚡ シミュレーション結果</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f8f9fa"><td style="padding:10px;border:1px solid #eee"><strong>年間発電量</strong></td><td style="padding:10px;border:1px solid #eee;text-align:right;font-size:18px;color:#1e3a5f"><strong>${r.annualKWh || '—'} kWh</strong></td></tr>
      <tr><td style="padding:10px;border:1px solid #eee"><strong>年間節約額</strong></td><td style="padding:10px;border:1px solid #eee;text-align:right;font-size:18px;color:#f59e0b"><strong>${r.annualSavings || '—'} 万円</strong></td></tr>
      <tr style="background:#f8f9fa"><td style="padding:10px;border:1px solid #eee"><strong>投資回収期間</strong></td><td style="padding:10px;border:1px solid #eee;text-align:right;font-size:18px;color:#059669"><strong>${r.payback || '—'} 年</strong></td></tr>
      <tr><td style="padding:10px;border:1px solid #eee"><strong>25年累計利益</strong></td><td style="padding:10px;border:1px solid #eee;text-align:right;font-size:18px"><strong>${r.profit25 || '—'} 万円</strong></td></tr>
    </table>
  </div>

  <div style="margin:24px 0">
    <h2 style="font-size:16px;color:#1e3a5f;border-bottom:1px solid #eee;padding-bottom:8px">💰 補助金</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      ${(r.subsidies || []).map(s => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${s.name}<br><span style="font-size:11px;color:#999">${s.level}</span></td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#059669;font-weight:bold">▲¥${s.amount}万</td></tr>`).join('')}
      <tr style="background:#d1fae5"><td style="padding:10px;font-weight:bold">補助金合計</td><td style="padding:10px;text-align:right;font-size:16px;font-weight:bold;color:#059669">¥${r.totalSubsidy || '—'}万</td></tr>
    </table>
    <p style="margin-top:8px;padding:10px;background:#f8f9fa;border-radius:6px;font-size:13px"><strong>実質負担額:</strong> ¥${r.netCost || '—'}万</p>
  </div>

  <div style="margin:24px 0">
    <h2 style="font-size:16px;color:#1e3a5f;border-bottom:1px solid #eee;padding-bottom:8px">📊 計算条件</h2>
    <ul style="font-size:12px;color:#555;line-height:2">
      <li>気象データ: ${r.dataSource || 'Open-Meteo ERA5'}</li>
      <li>年間平均日射量: ${r.dailyGHI || '—'} kWh/m²/日</li>
      <li>方位係数: ${r.orientF || '—'} / 遮蔽係数: ${r.shadingF || '—'}</li>
      <li>施工会社: ${r.company || '—'}</li>
      <li>電力単価: ¥30/kWh（自家消費）/ ¥12/kWh（売電）</li>
    </ul>
  </div>

  <div style="margin:30px 0;text-align:center;padding:24px;background:#1a1a2e;border-radius:12px">
    <h3 style="color:#fff;margin:0 0 8px">🎯 次のステップ</h3>
    <p style="color:rgba(255,255,255,.6);font-size:12px;margin:0 0 16px">無料現地調査・詳細見積もりをご希望の場合</p>
    <a href="https://solariq-japan.vercel.app" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#1a1a2e;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">SolarIQで相談する</a>
  </div>

  <div style="margin-top:30px;padding-top:16px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#999">
    <p>このメールはSolarIQ (solariq-japan.vercel.app) から送信されました</p>
    <p>※ 補助金は年度・予算により変動します。正式な金額は施工会社にご確認ください。</p>
  </div>
</body>
</html>`;
}
