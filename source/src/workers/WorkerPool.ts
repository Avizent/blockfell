import WorldWorker from './world.worker?worker&inline';
import type { WorkerRequest, WorkerResponse } from './protocol';

type DistReq<T> = T extends unknown ? Omit<T, 'id'> : never;
export type JobRequest = DistReq<WorkerRequest>;

export interface Job {
  type: 'gen' | 'mesh';
  /** Builds the request at dispatch time, so queued jobs always carry fresh data. */
  build: () => { req: JobRequest; transfer?: Transferable[] };
  priority: () => number;         // evaluated at dispatch time (lower = sooner)
  valid: () => boolean;           // dropped without running if no longer needed
  onDone: (res: WorkerResponse) => void;
  onDrop?: () => void;
}

/**
 * Small priority-scheduled pool of world workers. Jobs are not dispatched until a
 * worker has spare capacity, so the queue can be re-prioritised as the player moves
 * (closest chunks always first) and stale jobs are dropped cheaply.
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private inflight: number[] = [];
  private pending: Job[] = [];
  private callbacks = new Map<number, { job: Job; worker: number }>();
  private pendingCount_ = { gen: 0, mesh: 0 };
  private nextId = 1;
  private maxPerWorker = 2;
  readonly size: number;
  errors = 0;

  constructor(size?: number) {
    const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.size = size ?? Math.max(1, Math.min(4, hc - 1));
    for (let i = 0; i < this.size; i++) this.spawnWorker(i);
  }

  private spawnWorker(i: number): void {
    const w = new WorldWorker();
    w.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(i, e.data);
    w.onerror = (e) => {
      // an uncaught worker error: fail every job that worker was running so no chunk waits forever
      this.errors++;
      console.error('world worker error', e.message);
      e.preventDefault?.();
      for (const [id, cb] of [...this.callbacks]) {
        if (cb.worker !== i) continue;
        this.callbacks.delete(id);
        cb.job.onDone({ type: 'error', id, message: String(e.message) });
      }
      this.inflight[i] = 0;
    };
    this.workers[i] = w;
    this.inflight[i] = 0;
  }

  submit(job: Job): void {
    this.pending.push(job);
    this.pendingCount_[job.type]++;
  }

  get pendingCount(): number { return this.pending.length; }
  pendingOf(type: 'gen' | 'mesh'): number {
    return this.pendingCount_[type];
  }
  get inflightCount(): number { return this.inflight.reduce((a, b) => a + b, 0); }

  private freeSlots(): number {
    let free = 0;
    for (let i = 0; i < this.workers.length; i++) free += this.maxPerWorker - this.inflight[i];
    return free;
  }

  /** Dispatches as many of the highest-priority jobs as workers can take. */
  pump(): void {
    if (this.pending.length === 0) return;
    let free = this.freeSlots();
    if (free <= 0) return; // nothing can be dispatched: skip validation/sorting entirely
    // drop invalid jobs, then evaluate priorities once
    const scored: { job: Job; p: number }[] = [];
    let w = 0;
    for (const j of this.pending) {
      if (!j.valid()) { this.pendingCount_[j.type]--; j.onDrop?.(); continue; }
      this.pending[w++] = j;
      scored.push({ job: j, p: j.priority() });
    }
    this.pending.length = w;
    scored.sort((a, b) => a.p - b.p);
    const dispatched = new Set<Job>();
    for (const sj of scored) {
      if (free <= 0) break;
      let best = -1;
      for (let i = 0; i < this.workers.length; i++) {
        if (this.inflight[i] < this.maxPerWorker && (best < 0 || this.inflight[i] < this.inflight[best])) best = i;
      }
      if (best < 0) break;
      const id = this.nextId++;
      this.callbacks.set(id, { job: sj.job, worker: best });
      this.inflight[best]++;
      free--;
      dispatched.add(sj.job);
      this.pendingCount_[sj.job.type]--;
      const { req, transfer } = sj.job.build();
      this.workers[best].postMessage({ ...req, id }, transfer ?? []);
    }
    if (dispatched.size) this.pending = this.pending.filter((j) => !dispatched.has(j));
  }

  private onMessage(worker: number, res: WorkerResponse): void {
    const cb = this.callbacks.get(res.id);
    this.inflight[worker] = Math.max(0, this.inflight[worker] - 1);
    if (!cb) return;
    this.callbacks.delete(res.id);
    if (res.type === 'error') {
      this.errors++;
      console.error('Worker job failed:', res.message);
    }
    cb.job.onDone(res);
    // keep workers busy even when rendering is slow or the tab is throttled
    this.pump();
  }

  clearPending(): void {
    for (const j of this.pending) j.onDrop?.();
    this.pending = [];
    this.pendingCount_.gen = 0;
    this.pendingCount_.mesh = 0;
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.pending = [];
    this.callbacks.clear();
  }
}
