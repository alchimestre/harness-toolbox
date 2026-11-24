import { getOrderByRef, handleError, listOrders, payOrder, postOrder } from './routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';
import { dispatchShipment, deliverShipment, listShipments, postShipment } from './shipments.js';
import { getCustomerSummary, getOrderExport, getTopCustomers } from './summary.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('server');

type Handler = (req: HttpRequest, res: HttpResponse) => Promise<void>;

export const ROUTES: Record<string, Handler> = {
  'POST /orders': postOrder,
  'GET /orders/:ref': getOrderByRef,
  'GET /customers/:customerId/orders': listOrders,
  'POST /orders/:id/pay': payOrder,
  'GET /customers/:customerId/summary': getCustomerSummary,
  'GET /summary/top': getTopCustomers,
  'GET /exports/orders': getOrderExport,
};

export async function dispatchRequest(method: string, path: string, req: HttpRequest, res: HttpResponse): Promise<void> {
  const match = findRoute(method, path);
  if (!match) {
    res.status(404).json({ error: 'no route' });
    return;
  }
  req.params = { ...req.params, ...match.params };
  try {
    await match.handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
}

export function findRoute(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
  for (const [pattern, handler] of Object.entries(ROUTES)) {
    const [patternMethod, patternPath] = pattern.split(' ');
    if (patternMethod !== method) {
      continue;
    }
    const params = matchPath(patternPath, path);
    if (params) {
      return { handler, params };
    }
  }
  log.debug('no route', { method, path });
  return null;
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const part = patternParts[index];
    if (part.startsWith(':')) {
      params[part.slice(1)] = pathParts[index];
    } else if (part !== pathParts[index]) {
      return null;
    }
  }
  return params;
}

export const SHIPMENT_HANDLERS = { postShipment, dispatchShipment, deliverShipment, listShipments };
