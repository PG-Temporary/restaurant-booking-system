// Shared by `npm run db:seed` and the integration tests. Uses relative imports
// with explicit extensions so Node can run it directly (no TS runner needed).
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.ts";

export const DEMO_PASSWORD = "password123";

const GAZETTEER: Array<[key: string, name: string, lat: number, lng: number]> = [
  ["london", "London", 51.5074, -0.1278],
  ["manchester", "Manchester", 53.4808, -2.2426],
  ["birmingham", "Birmingham", 52.4862, -1.8904],
  ["leeds", "Leeds", 53.8008, -1.5491],
  ["bristol", "Bristol", 51.4545, -2.5879],
  ["edinburgh", "Edinburgh", 55.9533, -3.1883],
  ["e1", "E1, London", 51.5155, -0.0722],
  ["ec1", "EC1, London", 51.5236, -0.1034],
  ["n1", "N1, London", 51.5362, -0.1033],
  ["se1", "SE1, London", 51.5034, -0.0928],
  ["sw1a", "SW1A, London", 51.5014, -0.1419],
  ["w1", "W1, London", 51.5154, -0.1419],
  ["wc2", "WC2, London", 51.5117, -0.1240],
  ["nw1", "NW1, London", 51.5341, -0.1424],
  ["m1", "M1, Manchester", 53.4794, -2.2377],
  ["bs1", "BS1, Bristol", 51.4545, -2.5983],
];

interface DemoRestaurant {
  email: string;
  ownerName: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  city: string;
  postcode: string;
  lat: number;
  lng: number;
  tables: Array<[name: string, capacity: number]>;
  /** [dayOfWeek[], opens, closes][] */
  hours: Array<[number[], string, string]>;
}

const TUE_SUN = [0, 2, 3, 4, 5, 6];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

const RESTAURANTS: DemoRestaurant[] = [
  {
    email: "owner.trattoria@example.com", ownerName: "Giulia Rossi", name: "Trattoria Brick Lane", slug: "trattoria-brick-lane",
    description: "Wood-fired pizza and handmade pasta.", address: "12 Brick Lane", city: "London", postcode: "E1 6QL", lat: 51.5215, lng: -0.0717,
    tables: [["T1", 2], ["T2", 2], ["T3", 4], ["T4", 4], ["T5", 6]],
    hours: [[EVERY_DAY, "12:00", "15:00"], [EVERY_DAY, "18:00", "22:30"]],
  },
  {
    email: "owner.sakura@example.com", ownerName: "Ken Tanaka", name: "Sakura Izakaya", slug: "sakura-izakaya",
    description: "Small plates, yakitori and sake.", address: "4 Greek Street", city: "London", postcode: "W1D 4DB", lat: 51.5135, lng: -0.1306,
    tables: [["Counter 1", 2], ["Counter 2", 2], ["Booth A", 4], ["Booth B", 4]],
    hours: [[TUE_SUN, "17:30", "23:00"]],
  },
  {
    email: "owner.thames@example.com", ownerName: "Alice Morgan", name: "The Thames Grill", slug: "the-thames-grill",
    description: "Steaks and seafood by the river.", address: "1 Bankside", city: "London", postcode: "SE1 9JA", lat: 51.5081, lng: -0.0993,
    tables: [["River 1", 4], ["River 2", 4], ["Window 1", 2], ["Long table", 10]],
    hours: [[EVERY_DAY, "12:00", "22:00"]],
  },
  {
    email: "owner.spice@example.com", ownerName: "Priya Nair", name: "Spice Route Kitchen", slug: "spice-route-kitchen",
    description: "Regional Indian cooking, sharing plates.", address: "88 Upper Street", city: "London", postcode: "N1 0NU", lat: 51.5389, lng: -0.1033,
    tables: [["1", 2], ["2", 2], ["3", 3], ["4", 4], ["5", 6]],
    hours: [[EVERY_DAY, "17:00", "22:30"]],
  },
  {
    email: "owner.northern@example.com", ownerName: "Tom Hughes", name: "Northern Quarter Bistro", slug: "northern-quarter-bistro",
    description: "Seasonal British bistro.", address: "21 Tib Street", city: "Manchester", postcode: "M4 1LX", lat: 53.4837, lng: -2.2357,
    tables: [["A", 2], ["B", 2], ["C", 4], ["D", 6]],
    hours: [[TUE_SUN, "11:30", "14:30"], [TUE_SUN, "17:00", "22:00"]],
  },
];

/** Idempotent: wipes demo data first. Returns handy ids for tests. */
export async function seedDemo(prisma: PrismaClient) {
  await prisma.reservation.deleteMany();
  await prisma.block.deleteMany();
  await prisma.openingHours.deleteMany();
  await prisma.table.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.geoPlace.deleteMany();

  await prisma.geoPlace.createMany({
    data: GAZETTEER.map(([key, name, lat, lng]) => ({ key, name, lat, lng })),
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const restaurantIds: Record<string, string> = {};
  for (const r of RESTAURANTS) {
    const owner = await prisma.user.create({
      data: { email: r.email, name: r.ownerName, passwordHash, role: "OWNER" },
    });
    const created = await prisma.restaurant.create({
      data: {
        ownerId: owner.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        address: r.address,
        city: r.city,
        postcode: r.postcode,
        latitude: r.lat,
        longitude: r.lng,
        timezone: "Europe/London",
        slotLengthMinutes: 90,
        slotIntervalMinutes: 30,
        leadTimeMinutes: 60,
        maxPartySize: 8,
        tables: { create: r.tables.map(([name, capacity]) => ({ name, capacity })) },
        openingHours: {
          create: r.hours.flatMap(([days, opensAt, closesAt]) => days.map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt }))),
        },
      },
    });
    restaurantIds[r.slug] = created.id;
  }
  const diner = await prisma.user.create({
    data: { email: "diner@example.com", name: "Demo Diner", passwordHash, role: "DINER" },
  });
  return { restaurantIds, dinerId: diner.id, ownerEmails: RESTAURANTS.map((r) => r.email) };
}
