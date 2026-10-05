// Notification seam. v1 only logs; plug an email/SMS sender in by implementing
// `Notifier` and calling setNotifier() at startup.

export interface ReservationNotice {
  confirmationCode: string;
  restaurantName: string;
  guestName: string;
  guestEmail: string;
  partySize: number;
  startsAt: Date;
}

export interface Notifier {
  reservationConfirmed(n: ReservationNotice): Promise<void>;
  reservationModified(n: ReservationNotice): Promise<void>;
  reservationCancelled(n: ReservationNotice): Promise<void>;
}

class ConsoleNotifier implements Notifier {
  private log(event: string, n: ReservationNotice) {
    if (process.env.NODE_ENV === "test") return;
    console.log(
      `[notify] ${event} code=${n.confirmationCode} restaurant="${n.restaurantName}" party=${n.partySize} at=${n.startsAt.toISOString()}`,
    );
  }
  async reservationConfirmed(n: ReservationNotice) {
    this.log("confirmed", n);
  }
  async reservationModified(n: ReservationNotice) {
    this.log("modified", n);
  }
  async reservationCancelled(n: ReservationNotice) {
    this.log("cancelled", n);
  }
}

let current: Notifier = new ConsoleNotifier();
export const getNotifier = (): Notifier => current;
export const setNotifier = (n: Notifier): void => {
  current = n;
};
