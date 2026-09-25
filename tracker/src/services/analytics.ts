import type { Account, Client, Clipper, Repo } from '../db/repo.js';
import { computeRewardCents } from '../domain/rewards.js';
import {
  type Comparison,
  compareWindows,
  DAY,
  dailyGains,
  sumComparisons,
  WINDOWS,
  type WindowKey,
} from '../domain/stats.js';

export interface AccountStats {
  account: Account;
  windows: Record<WindowKey, Comparison>;
  daily: number[];
}

export interface LeaderboardRow {
  clipper: Clipper;
  accounts: number;
  stats: Comparison;
  rewardCents: number | null;
}

const HISTORY_DAYS = 30;

export class Analytics {
  constructor(private readonly repo: Repo) {}

  private snapshots(accountId: number, now: number) {
    // 2 × la plus grande fenêtre pour pouvoir comparer 30 j vs les 30 j d'avant.
    return this.repo.getAccountSnapshots(accountId, now - 2 * WINDOWS['30d']);
  }

  accountStats(account: Account, now = Date.now()): AccountStats {
    const snaps = this.snapshots(account.id, now);
    return {
      account,
      windows: {
        '24h': compareWindows(snaps, now, WINDOWS['24h']),
        '7d': compareWindows(snaps, now, WINDOWS['7d']),
        '30d': compareWindows(snaps, now, WINDOWS['30d']),
      },
      daily: dailyGains(snaps, now, HISTORY_DAYS),
    };
  }

  /** Progression d'un clipper sur une fenêtre, éventuellement limitée aux comptes d'un client. */
  clipperComparison(clipperId: number, windowMs: number, opts: { clientId?: number; now?: number } = {}): Comparison {
    const now = opts.now ?? Date.now();
    const accounts = this.repo.listAccountsForClipper(clipperId, opts.clientId);
    return sumComparisons(accounts.map((a) => compareWindows(this.snapshots(a.id, now), now, windowMs)));
  }

  leaderboard(window: WindowKey, opts: { client?: Client; now?: number } = {}): LeaderboardRow[] {
    const now = opts.now ?? Date.now();
    const rows: LeaderboardRow[] = [];
    for (const clipper of this.repo.listActiveClippers()) {
      const accounts = this.repo.listAccountsForClipper(clipper.id, opts.client?.id);
      if (accounts.length === 0) continue;
      const stats = sumComparisons(accounts.map((a) => compareWindows(this.snapshots(a.id, now), now, WINDOWS[window])));
      rows.push({
        clipper,
        accounts: accounts.length,
        stats,
        rewardCents: opts.client ? computeRewardCents(stats.current, opts.client.rule) : null,
      });
    }
    return rows.sort((a, b) => b.stats.current - a.stats.current);
  }

  clipperDetail(clipperId: number, now = Date.now()) {
    const clipper = this.repo.getClipper(clipperId);
    if (!clipper) return undefined;
    const accounts = this.repo.listAccountsForClipper(clipperId).map((a) => this.accountStats(a, now));
    const windows = Object.fromEntries(
      (Object.keys(WINDOWS) as WindowKey[]).map((w) => [w, sumComparisons(accounts.map((a) => a.windows[w]))]),
    ) as Record<WindowKey, Comparison>;
    const daily = Array.from({ length: HISTORY_DAYS }, (_, i) => accounts.reduce((s, a) => s + (a.daily[i] ?? 0), 0));
    return {
      clipper,
      windows,
      daily,
      accounts,
      lastPostAt: this.repo.lastPostAt(clipperId),
      topVideos: this.repo.topVideos(clipperId),
    };
  }

  /** Données nécessaires aux règles de relance pour un clipper. */
  activity(clipper: Clipper, dropWindowDays: number, now = Date.now()) {
    const accounts = this.repo.listAccountsForClipper(clipper.id);
    const comparison = this.clipperComparison(clipper.id, dropWindowDays * DAY, { now });
    return {
      lastPostAt: this.repo.lastPostAt(clipper.id),
      trackedSince: Math.min(...accounts.map((a) => a.createdAt)),
      recentViews: comparison.current,
      previousViews: comparison.previous,
      comparisonComplete: comparison.complete,
    };
  }
}
