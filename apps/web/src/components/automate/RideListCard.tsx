import type { RideCardDto } from "@saferstreets/shared";
import Link from "next/link";
import { Avatar, Button, Card, Icon, StatusChip } from "@/components/ui";
import { RIDE_STATUS_LABEL, RIDE_STATUS_NAME, formatRideTime, formatRupees, seatsLabel } from "@/lib/automate";

/** Ride card (A4): route, time, seats chip, host row (members only), fare and the single action. */
export function RideListCard({ ride }: { ride: RideCardDto }) {
  const full = ride.status === "FULL";
  const closed = ride.status === "COMPLETED" || ride.status === "CANCELLED";
  return (
    <Card as="article" className="flex flex-col gap-3" data-testid="ride-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="type-h3">{formatRideTime(ride.departureAt)}</h3>
          <p className="mt-1 flex items-start gap-1 text-[14px] leading-5">
            <Icon name="saferoute" size={16} className="mt-0.5 shrink-0 text-text-secondary" />
            <span className="min-w-0 break-words">
              {ride.sourceText} <span className="text-text-secondary">to</span> {ride.destText}
            </span>
          </p>
        </div>
        {closed || ride.status === "IN_PROGRESS" ? (
          <StatusChip status={RIDE_STATUS_NAME[ride.status]} label={RIDE_STATUS_LABEL[ride.status]} />
        ) : full ? (
          <StatusChip status="Full" />
        ) : (
          <StatusChip tone="mint" label={seatsLabel(ride.seatsLeft)} />
        )}
      </div>

      {ride.host ? (
        <div className="flex items-center gap-2">
          <Avatar name={ride.host.displayName} imageUrl={ride.host.avatarUrl} size={32} />
          <div className="min-w-0 text-[14px] leading-5">
            <p className="font-medium">{ride.isMine ? "You are driving" : ride.host.displayName}</p>
            <p className="text-[12px] leading-4 text-text-secondary">
              {ride.host.completedRides} {ride.host.completedRides === 1 ? "ride" : "rides"} completed
            </p>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[14px] leading-5 text-text-secondary">
          <Icon name="profile" size={16} />
          Log in to see who is driving
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p>
          <span className="font-display font-semibold">{formatRupees(ride.perPersonFare)}</span>
          <span className="ml-1 text-[12px] leading-4 text-text-secondary">each, est.</span>
        </p>
        {full ? (
          <Button variant="secondary" size="sm" disabled>
            Full
          </Button>
        ) : (
          <Button asChild variant={closed ? "secondary" : "ink"} size="sm">
            <Link href={`/automate/${ride.id}`}>{closed ? "View ride" : "View and request"}</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
