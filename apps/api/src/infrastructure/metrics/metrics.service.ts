import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/** One registry, three app-specific metrics (plus prom-client's own process/Node.js defaults —
 * event loop lag, heap, GC, etc., via collectDefaultMetrics) — everything `GET /metrics` (see
 * MetricsController) exposes in Prometheus text format. Global (see MetricsModule) so any module
 * can record against it without importing a whole module just for one counter increment. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, labeled by method/route/status',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  /** Updated periodically from BullMQ's own job counts (see QueueMetricsCollector), not derived
   * from anything request-scoped — a gauge, not a counter, since depth goes up and down. */
  readonly queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Number of BullMQ jobs in a given state, labeled by queue name and state',
    labelNames: ['queue', 'state'],
    registers: [this.registry],
  });

  readonly uploadThroughputBytes = new Counter({
    name: 'upload_throughput_bytes_total',
    help: 'Total bytes of file content successfully uploaded and checksum-verified',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
