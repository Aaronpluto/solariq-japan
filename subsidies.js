// Vercel Serverless Function: Search Japanese subsidies via jGrants public API
// デジタル庁の jGrants 公開API を使い、太陽光・蓄電池関連の補助金を実時間検索

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keyword, prefecture } = req.query;
  const searchKeyword = keyword || '太陽光';

  try {
    // jGrants API: search subsidies
    const url = `https://api.jgrants-subsidy.go.jp/exp/v1/public/subsidies?keyword=${encodeURIComponent(searchKeyword)}&acceptance=1&sort=created_date&order=DESC`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      // jGrants may require different endpoint format, try alternative
      const altUrl = `https://api.jgrants-subsidy.go.jp/exp/v1/public/subsidies?keyword=${encodeURIComponent(searchKeyword)}`;
      const altResponse = await fetch(altUrl);
      if (!altResponse.ok) {
        throw new Error(`jGrants API returned ${altResponse.status}`);
      }
      const altData = await altResponse.json();
      return processAndReturn(res, altData, prefecture);
    }

    const data = await response.json();
    return processAndReturn(res, data, prefecture);

  } catch (err) {
    console.error('Subsidy search error:', err);
    // Fallback: return curated static data when API fails
    return res.status(200).json({
      source: 'static_fallback',
      note: 'jGrants API unavailable, using curated reference data (2025)',
      subsidies: getStaticSubsidies(prefecture),
    });
  }
}

function processAndReturn(res, data, prefecture) {
  // Filter and format results
  const subsidies = (data.result || data.subsidies || [])
    .filter(s => {
      // Filter for solar/battery related
      const title = (s.title || s.subsidy_name || '').toLowerCase();
      const isSolar = title.includes('太陽光') || title.includes('再エネ') ||
                      title.includes('蓄電') || title.includes('省エネ') ||
                      title.includes('ゼロカーボン') || title.includes('脱炭素');
      // Filter by prefecture if specified
      if (prefecture && s.target_area_search) {
        return isSolar && s.target_area_search.includes(prefecture);
      }
      return isSolar;
    })
    .slice(0, 10)
    .map(s => ({
      id: s.id || s.subsidy_id,
      name: s.title || s.subsidy_name || '不明',
      organization: s.subsidy_executing_organization || s.executing_organization || '',
      target: s.target_area_search || '全国',
      acceptanceStart: s.acceptance_start_datetime || '',
      acceptanceEnd: s.acceptance_end_datetime || '',
      summary: (s.target_number || s.subsidy_max_limit || '').substring(0, 200),
      url: s.detail_url || `https://www.jgrants-portal.go.jp/subsidy/${s.id || ''}`,
      level: determineLevel(s),
    }));

  return res.status(200).json({
    source: 'jGrants_API',
    count: subsidies.length,
    subsidies,
  });
}

function determineLevel(s) {
  const org = (s.subsidy_executing_organization || s.executing_organization || '').toLowerCase();
  if (org.includes('経済産業') || org.includes('環境省') || org.includes('国土交通')) return '国';
  if (org.includes('都') || org.includes('府') || org.includes('県')) return '都道府県';
  if (org.includes('市') || org.includes('区') || org.includes('町') || org.includes('村')) return '市区町村';
  return '国';
}

// Static fallback data (curated from 2025 research)
function getStaticSubsidies(prefecture) {
  const national = [
    {
      name: '需要家主導型太陽光発電・蓄電池導入支援',
      organization: '経済産業省 資源エネルギー庁',
      level: '国',
      estimatedAmount: '設備費の1/3以内、上限あり',
      perKW: 40000,
      maxTotal: 15000000,
      note: '自家消費型に限る。FIT/FIP売電は対象外',
    },
    {
      name: 'ストレージパリティ達成蓄電池導入支援',
      organization: '経済産業省',
      level: '国',
      estimatedAmount: '蓄電池 ¥5.3万/kWh以内',
      perKWhBattery: 53000,
      maxTotal: 10000000,
      note: '太陽光とセット導入が条件',
    },
  ];

  const prefData = {
    tokyo: [
      { name: '東京都 集合住宅向け太陽光発電設備等設置推進事業', organization: '東京都環境局', level: '都道府県', perKW: 120000, maxTotal: 6000000, note: '令和7年度。3/4kW上限あり' },
      { name: '東京都 地産地消型再エネ増強プロジェクト', organization: '東京都環境局', level: '都道府県', perKW: 50000, maxTotal: 5000000, note: '事業所向け' },
    ],
    osaka: [
      { name: '大阪府 再生可能エネルギー設備導入補助金', organization: '大阪府', level: '都道府県', perKW: 40000, maxTotal: 3000000, note: '中小企業向け' },
    ],
    aichi: [
      { name: '愛知県 自家消費型太陽光発電設備導入促進費補助金', organization: '愛知県', level: '都道府県', perKW: 50000, maxTotal: 5000000, note: '10kW以上' },
    ],
    fukuoka: [
      { name: '福岡県 再エネ導入促進事業費補助金', organization: '福岡県', level: '都道府県', perKW: 35000, maxTotal: 2500000, note: '県内事業者' },
    ],
  };

  const pref = prefecture ? (prefData[prefecture] || []) : prefData.tokyo;
  return [...national, ...pref];
}
