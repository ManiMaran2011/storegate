export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface Comment {
  author: string;
  body: string;
  at: string;
}

export interface Ticket {
  id: number;
  title: string;
  body: string;
  status: TicketStatus;
  priority: Priority;
  order_id: number | null;
  created_at: string;
  updated_at: string;
  comments: Comment[];
}

const MAX_TICKETS = 1000;

/**
 * In-memory ticket store. State is intentionally ephemeral: this server exists
 * to be a second, independent upstream for the gateway. It resets on pod restart.
 */
export class TicketStore {
  private readonly tickets = new Map<number, Ticket>();
  private nextId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {
    this.seed();
  }

  private seed(): void {
    this.create({ title: "Customer asks where their parcel is", body: "Tracking has not updated for 3 days.", priority: "high", order_id: 1 });
    this.create({ title: "Wrong size delivered", body: "Ordered M, received L. Wants an exchange.", priority: "normal", order_id: null });
    const closed = this.create({ title: "Invoice copy requested", body: "Needs a PDF invoice for accounts.", priority: "low", order_id: null });
    this.update(closed.id, { status: "closed" });
  }

  list(filter: { status?: TicketStatus; order_id?: number } = {}): Ticket[] {
    return [...this.tickets.values()]
      .filter((t) => (filter.status ? t.status === filter.status : true))
      .filter((t) => (filter.order_id !== undefined ? t.order_id === filter.order_id : true))
      .sort((a, b) => b.id - a.id);
  }

  get(id: number): Ticket | undefined {
    return this.tickets.get(id);
  }

  create(input: { title: string; body: string; priority: Priority; order_id: number | null }): Ticket {
    if (this.tickets.size >= MAX_TICKETS) throw new Error("Ticket limit reached for this demo store.");
    const ts = this.now().toISOString();
    const ticket: Ticket = { id: this.nextId++, status: "open", comments: [], created_at: ts, updated_at: ts, ...input };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  update(id: number, patch: { status?: TicketStatus }): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    if (patch.status) ticket.status = patch.status;
    ticket.updated_at = this.now().toISOString();
    return ticket;
  }

  comment(id: number, author: string, body: string): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.comments.push({ author, body, at: this.now().toISOString() });
    ticket.updated_at = this.now().toISOString();
    return ticket;
  }

  search(query: string): Ticket[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.list().filter((t) => t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
  }
}
