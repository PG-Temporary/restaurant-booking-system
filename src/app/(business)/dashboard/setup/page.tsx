import { SetupForm } from "@/components/SetupForm";
import { TablesManager } from "@/components/TablesManager";
import { requireOwnerPage } from "@/lib/owner-page";
import { getOwnerRestaurant } from "@/services/restaurants";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { restaurantId } = await requireOwnerPage();
  const r = await getOwnerRestaurant(restaurantId);
  return (
    <>
      <h1>Restaurant setup</h1>
      <p className="lede">Diners can find and book you once you have opening hours, at least one table, and a location we recognise.</p>
      <div style={{ marginTop: 22 }}>
      <SetupForm
        initial={{
          name: r.name, description: r.description, address: r.address, city: r.city, postcode: r.postcode,
          latitude: r.latitude, longitude: r.longitude, timezone: r.timezone,
          slotLengthMinutes: r.slotLengthMinutes, slotIntervalMinutes: r.slotIntervalMinutes,
          leadTimeMinutes: r.leadTimeMinutes, maxPartySize: r.maxPartySize,
          openingHours: r.openingHours.map((h) => ({ dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt })),
        }}
      />
      </div>
      <h2>Tables</h2>
      <TablesManager tables={r.tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, active: t.active }))} />
    </>
  );
}
