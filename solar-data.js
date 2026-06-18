// Vercel Serverless Function: Get real solar irradiance data from Open-Meteo
// Uses historical archive (past 1 year) to calculate average hourly irradiance by month

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  try {
    // Get past 1 year of hourly data
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startStr}&end_date=${endStr}&hourly=shortwave_radiation,temperature_2m&timezone=Asia%2FTokyo`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo returned ${response.status}`);
    }
    const data = await response.json();

    // Process: calculate monthly averages (12 months × 24 hours)
    const hourly = data.hourly;
    if (!hourly || !hourly.time) {
      throw new Error('No hourly data returned');
    }

    // Initialize accumulators: monthlyGHI[month][hour] = {sum, count}
    const monthlyGHI = Array.from({ length: 12 }, () =>
      Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }))
    );
    const monthlyTemp = Array.from({ length: 12 }, () => ({ sum: 0, count: 0 }));
    let totalGHI = 0;
    let totalHours = 0;

    for (let i = 0; i < hourly.time.length; i++) {
      const dt = new Date(hourly.time[i]);
      const month = dt.getMonth(); // 0-11
      const hour = dt.getHours();  // 0-23
      const ghi = hourly.shortwave_radiation[i];
      const temp = hourly.temperature_2m[i];

      if (ghi !== null && ghi !== undefined) {
        monthlyGHI[month][hour].sum += ghi;
        monthlyGHI[month][hour].count += 1;
        totalGHI += ghi;
        totalHours++;
      }
      if (temp !== null && temp !== undefined) {
        monthlyTemp[month].sum += temp;
        monthlyTemp[month].count += 1;
      }
    }

    // Calculate averages
    const ghiByMonthHour = monthlyGHI.map(month =>
      month.map(h => h.count > 0 ? Math.round(h.sum / h.count * 10) / 10 : 0)
    );

    const tempByMonth = monthlyTemp.map(m =>
      m.count > 0 ? Math.round(m.sum / m.count * 10) / 10 : 15
    );

    // Annual average daily GHI (kWh/m²/day)
    // totalGHI is in W/m², hourly values. Convert: sum(W/m²) / 1000 / days
    const days = Math.round(totalHours / 24);
    const annualDailyGHI = days > 0 ? Math.round(totalGHI / 1000 / days * 100) / 100 : 4.0;

    // Monthly daily totals (kWh/m²/day per month)
    const monthlyDailyGHI = ghiByMonthHour.map(month => {
      const dailyTotal = month.reduce((sum, v) => sum + v, 0) / 1000; // W→kW
      return Math.round(dailyTotal * 100) / 100;
    });

    // Sunny day ratio estimate (days with > 3 kWh/m²/day)
    // Simplified: use the peak hour ratio
    const sunnyRatio = monthlyDailyGHI.map(d => Math.min(0.7, d / 7));

    return res.status(200).json({
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      period: { start: startStr, end: endStr, days },
      annualDailyGHI,
      monthlyDailyGHI,
      ghiByMonthHour,
      tempByMonth,
      sunnyRatio,
      source: 'Open-Meteo Archive (ERA5 reanalysis)',
    });

  } catch (err) {
    console.error('Solar data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
