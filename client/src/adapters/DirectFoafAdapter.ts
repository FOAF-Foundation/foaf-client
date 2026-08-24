import { FoafLedgerClient, viewerBalance } from '../ledger';
import type { TrustlineRow } from '../ledger';
import { trustlineCounterParty } from '../ui/hooks/types';
import type {
  CreditLedgerDataSource,
  CreditLedgerSummary,
  CreditPayment,
  CreditPaymentPath,
  CreditTrustline,
  CreateTrustlineInput,
  FindPathInput,
  LedgerId,
  PaymentInput,
  UpdateTrustlineInput,
} from './types';

export interface DirectFoafAdapterOptions {
  client: FoafLedgerClient;
  networkAddress: string;
  viewerAddress: string;
}

export class DirectFoafAdapter implements CreditLedgerDataSource {
  constructor(private readonly options: DirectFoafAdapterOptions) {}

  async listTrustlines(): Promise<CreditTrustline[]> {
    const rows = await this.options.client.userTrustlines(
      this.options.networkAddress,
      this.options.viewerAddress,
    );
    return rows.map((row) => this.mapTrustline(row));
  }

  async getTrustline(id: LedgerId): Promise<CreditTrustline> {
    const trustline = (await this.listTrustlines()).find((row) => String(row.id) === String(id));
    if (!trustline) throw new Error(`FOAF trustline ${id} was not found`);
    return trustline;
  }

  async createTrustline(params: CreateTrustlineInput): Promise<CreditTrustline> {
    if (!params.counterpartyAddress) throw new Error('counterpartyAddress is required');
    const result = await this.options.client.updateTrustline({
      networkAddress: this.options.networkAddress,
      creditorAddress: this.options.viewerAddress,
      debtorAddress: params.counterpartyAddress,
      creditlineGiven: String(params.creditlineGiven),
      creditlineReceived: String(params.creditlineReceived),
    });
    if (!result.ok) throw new Error(result.error);
    return this.getTrustline(params.counterpartyAddress);
  }

  async updateTrustline(id: LedgerId, params: UpdateTrustlineInput): Promise<CreditTrustline> {
    const current = await this.getTrustline(id);
    const counterpartyAddress = current.counterpartyAddress ?? String(id);
    const result = await this.options.client.updateTrustline({
      networkAddress: this.options.networkAddress,
      creditorAddress: this.options.viewerAddress,
      debtorAddress: counterpartyAddress,
      creditlineGiven: String(params.creditlineGiven ?? current.creditlineGiven),
      creditlineReceived: String(params.creditlineReceived ?? current.creditlineReceived),
    });
    if (!result.ok) throw new Error(result.error);
    return this.getTrustline(id);
  }

  async deactivateTrustline(id: LedgerId): Promise<void> {
    await this.updateTrustline(id, { creditlineGiven: 0, creditlineReceived: 0 });
  }

  async getSummary(): Promise<CreditLedgerSummary> {
    const trustlines = await this.listTrustlines();
    const netBalance = trustlines.reduce((total, row) => total + row.balance, 0);
    return {
      totalReceivable: trustlines.reduce(
        (total, row) => total + Math.max(row.balance, 0),
        0,
      ),
      totalPayable: trustlines.reduce(
        (total, row) => total + Math.max(-row.balance, 0),
        0,
      ),
      netBalance,
      trustlineCount: trustlines.length,
    };
  }

  async makeDirectPayment(id: LedgerId, params: PaymentInput): Promise<CreditPayment> {
    if (!params.idempotencyKey) throw new Error('idempotencyKey is required for a direct FOAF payment');
    const trustline = await this.getTrustline(id);
    const result = await this.options.client.createPendingTransfer({
      networkAddress: this.options.networkAddress,
      fromAddress: this.options.viewerAddress,
      toAddress: trustline.counterpartyAddress ?? String(id),
      value: String(params.amount),
      extraData: params.memo ? { memo: params.memo } : undefined,
      idempotencyKey: params.idempotencyKey,
    });
    if (!result.ok) throw new Error(result.error);
    return { id: result.data.id, amount: params.amount, status: result.data.status, raw: result.data };
  }

  async findPaymentPath(params: FindPathInput): Promise<CreditPaymentPath> {
    const toAddress = params.toAddress ?? String(params.toId ?? '');
    const result = await this.options.client.maxCapacityPathInfo(
      this.options.networkAddress,
      this.options.viewerAddress,
      toAddress,
    );
    return { capacity: Number(result.capacity), path: result.path, raw: result };
  }

  async executePathPayment(
    params: PaymentInput & { path: LedgerId[] },
  ): Promise<CreditPayment> {
    if (!params.idempotencyKey) throw new Error('idempotencyKey is required for a direct FOAF payment');
    const lastPathEntry = params.path[params.path.length - 1];
    const toAddress = params.toAddress ?? String(params.toId ?? lastPathEntry ?? '');
    const result = await this.options.client.createPendingTransfer({
      networkAddress: this.options.networkAddress,
      fromAddress: this.options.viewerAddress,
      toAddress,
      value: String(params.amount),
      path: params.path.map(String),
      extraData: params.memo ? { memo: params.memo } : undefined,
      idempotencyKey: params.idempotencyKey,
    });
    if (!result.ok) throw new Error(result.error);
    return { id: result.data.id, amount: params.amount, status: result.data.status, raw: result.data };
  }

  private mapTrustline(row: TrustlineRow): CreditTrustline {
    const counterparty = trustlineCounterParty(row) ?? String(row.id ?? '');
    const owner = typeof row.user_address === 'string'
      ? row.user_address
      : this.options.viewerAddress;
    const projected = viewerBalance(row, this.options.viewerAddress, owner);
    return {
      id: counterparty,
      counterpartyAddress: counterparty,
      balance: Number(projected.balance),
      creditlineGiven: Number(projected.creditlineGiven),
      creditlineReceived: Number(projected.creditlineReceived),
      raw: row,
    };
  }
}
