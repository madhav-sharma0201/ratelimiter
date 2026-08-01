import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const LB_PORT = process.env.PORT || process.env.LB_PORT || 3000;
const TARGET_PORTS = [3001, 3002, 3003];
const TARGET_HOSTS = TARGET_PORTS.map((port) => `http://127.0.0.1:${port}`);

let rrIndex = 0;

function getNextTarget() {
  const target = TARGET_HOSTS[rrIndex % TARGET_HOSTS.length];
  rrIndex = (rrIndex + 1) % TARGET_HOSTS.length;
  return target;
}

// Forward all incoming requests to backend cluster instances
app.all('*', async (req, res) => {
  const target = getNextTarget();
  const url = `${target}${req.originalUrl || req.url}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        ...req.headers
      }
    };

    // Remove headers that cause payload mismatch or proxy errors
    delete fetchOptions.headers.host;
    delete fetchOptions.headers['content-length'];

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const backendRes = await fetch(url, fetchOptions);
    const data = await backendRes.text();

    res.status(backendRes.status);
    backendRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Strip headers that cause browser duplicate CORS or response truncation issues
      if (
        ![
          'content-length',
          'content-encoding',
          'transfer-encoding',
          'access-control-allow-origin',
          'access-control-allow-credentials',
          'access-control-allow-methods',
          'access-control-allow-headers'
        ].includes(lowerKey)
      ) {
        res.setHeader(key, value);
      }
    });

    res.send(data);
  } catch (err) {
    console.error(`[Load Balancer] Failed to proxy to ${target}:`, err.message);
    res.status(502).json({
      error: 'Bad Gateway',
      message: `Failed to proxy request to backend instance at ${target}`
    });
  }
});

if (process.env.NODE_ENV !== 'test' && !process.env.NO_LISTEN) {
  app.listen(LB_PORT, '0.0.0.0', () => {
    console.log(`⚖️  [Load Balancer] Proxy running on port ${LB_PORT} -> Round Robin across [3001, 3002, 3003]`);
  });
}

export default app;
