// Vercel Serverless Function: Fetch Solar API DataLayers and return flux image as PNG
// Proxies the GeoTIFF from Google Solar API, converts to a colored heatmap PNG

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const GKEY = process.env.GOOGLE_SOLAR_KEY || 'AIzaSyBeiwOXgoQewhY4quuMzUcxHBzIRUhToYw';

  try {
    // Step 1: Get DataLayers metadata from Solar API
    const radius = 50; // meters around point
    const url = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=${radius}&view=FULL_LAYERS&requiredQuality=HIGH&pixelSizeMeters=0.5&key=${GKEY}`;

    const metaRes = await fetch(url);
    if (!metaRes.ok) {
      const err = await metaRes.json();
      return res.status(metaRes.status).json({ error: 'DataLayers API failed', detail: err });
    }
    const meta = await metaRes.json();

    // Step 2: Get the annual flux GeoTIFF URL
    const fluxUrl = meta.annualFluxUrl;
    const maskUrl = meta.maskUrl;
    const rgbUrl = meta.rgbUrl;

    if (!fluxUrl) {
      return res.status(404).json({ error: 'No annualFluxUrl available for this location' });
    }

    // Step 3: Fetch the GeoTIFF (binary)
    const tiffRes = await fetch(`${fluxUrl}&key=${GKEY}`);
    if (!tiffRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch GeoTIFF', status: tiffRes.status });
    }

    const tiffBuffer = await tiffRes.arrayBuffer();

    // Step 4: Return as base64 with metadata for frontend rendering
    const base64 = Buffer.from(tiffBuffer).toString('base64');

    // Also return bounds info for overlay positioning
    const imageryDate = meta.imageryDate || {};
    const bounds = {
      north: parseFloat(lat) + 0.0005,
      south: parseFloat(lat) - 0.0005,
      east: parseFloat(lng) + 0.0006,
      west: parseFloat(lng) - 0.0006,
    };

    // If metadata has proper bounds, use those
    if (meta.imageryProcessedDate) {
      // bounds are approximate based on radius
      const mPerDeg = 111320;
      const latOffset = radius / mPerDeg;
      const lngOffset = radius / (mPerDeg * Math.cos(parseFloat(lat) * Math.PI / 180));
      bounds.north = parseFloat(lat) + latOffset;
      bounds.south = parseFloat(lat) - latOffset;
      bounds.east = parseFloat(lng) + lngOffset;
      bounds.west = parseFloat(lng) - lngOffset;
    }

    return res.status(200).json({
      success: true,
      fluxTiff: base64,
      bounds,
      imageryDate,
      rgbUrl: rgbUrl ? `${rgbUrl}&key=${GKEY}` : null,
      maskUrl: maskUrl ? `${maskUrl}&key=${GKEY}` : null,
      pixelSize: meta.pixelSizeMeters || 0.5,
      note: 'GeoTIFF is base64 encoded. Use geotiff.js to parse in frontend.',
    });

  } catch (err) {
    console.error('Heatmap error:', err);
    return res.status(500).json({ error: err.message });
  }
}
