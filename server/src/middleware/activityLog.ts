import type { RequestHandler } from 'express';
import { persistHttpActivity, prefetchSnapshot } from '../activityLog.js';

const inflight = new Set<Promise<void>>();

export async function waitForActivityLog(): Promise<void> {
  await Promise.all([...inflight]);
}

export const activityLogMiddleware: RequestHandler = (req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    res.locals.activityResponse = body;
    return sendJson(body);
  }) as typeof res.json;

  const done = new Promise<void>((resolve) => {
    res.on('finish', () => {
      void persistHttpActivity(req, res)
        .catch((err) => {
          console.error('activity log persist failed', err);
        })
        .finally(resolve);
    });
  });
  inflight.add(done);
  void done.finally(() => inflight.delete(done));

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'POST') {
    next();
    return;
  }

  void prefetchSnapshot(req)
    .then((snap) => {
      req.activitySnapshot = snap;
    })
    .catch(() => {})
    .finally(() => next());
};
