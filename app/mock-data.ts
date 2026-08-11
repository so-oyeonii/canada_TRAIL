export type Recipient = {
  id: string;
  name: string;
  allocation: number;
  spent: number;
  purchase?: string;
};

export type Store = {
  id: string;
  time: string;
  name: string;
  category: string;
  spend: number;
  transfer: string;
};

export const initialRecipients: Recipient[] = [
  { id: "mother", name: "Mother", allocation: 60, spent: 55, purchase: "Premium maple gift set" },
  { id: "friend-1", name: "Friend 1", allocation: 30, spent: 24, purchase: "Local coffee" },
  { id: "friend-2", name: "Friend 2", allocation: 30, spent: 18 },
  { id: "lab", name: "Lab members", allocation: 60, spent: 21 },
  { id: "buffer", name: "Buffer", allocation: 20, spent: 0 },
];

export const stores: Store[] = [
  { id: "market", time: "10:40 AM", name: "St. Lawrence Market", category: "Canadian food gifts", spend: 40, transfer: "8 min walk" },
  { id: "local", time: "11:25 AM", name: "Toronto Local Goods", category: "Souvenirs & lifestyle", spend: 70, transfer: "12 min transit" },
  { id: "coffee", time: "12:10 PM", name: "Pilot Coffee Roasters", category: "Coffee gifts", spend: 30, transfer: "6 min walk" },
];

export const activities = [
  { name: "CN Tower", travel: "12 min", stay: "60 min", label: "Best fit", reason: "Iconic views and back well before your plan.", tone: "peach" },
  { name: "Waterfront Walk", travel: "8 min", stay: "45 min", label: "Nearby", reason: "Flexible timing with an easy hotel return.", tone: "blue" },
  { name: "Distillery District", travel: "16 min", stay: "75 min", label: "Local favorite", reason: "A relaxed browse that fits your free window.", tone: "gold" },
  { name: "Coffee nearby", travel: "4 min", stay: "30 min", label: "Relaxed", reason: "Recharge close by with zero schedule stress.", tone: "mint" },
];

export const layoverTimeline = [
  ["2:10 PM", "Arrival"],
  ["2:50 PM", "Immigration complete"],
  ["3:15 PM", "Leave airport"],
  ["3:50 PM", "Activity begins"],
  ["5:00 PM", "Return to airport"],
  ["5:35 PM", "Airport arrival"],
  ["6:15 PM", "Security complete"],
  ["7:00 PM", "Gate area"],
  ["8:30 PM", "Departure"],
];

export const restOptions = [
  { name: "Plaza Premium Lounge", walk: "7 min walk", price: "CAD 45", rest: "2h 35m", comfort: "High", rank: "TRAIL Best Match", reason: "The best comfort-to-time balance under your budget." },
  { name: "Quiet Zone", walk: "4 min walk", price: "Free", rest: "3h", comfort: "Medium", rank: "Longest rest", reason: "More rest time, with fewer amenities." },
  { name: "Airport café", walk: "5 min walk", price: "CAD 15–25", rest: "2h 45m", comfort: "Medium", rank: "Easy choice", reason: "Food and power outlets close to your gate path." },
  { name: "Nearby hotel", walk: "Shuttle required", price: "CAD 90+", rest: "1h 20m", comfort: "High", rank: "Not recommended", reason: "Transfer time and price do not fit this window." },
];
