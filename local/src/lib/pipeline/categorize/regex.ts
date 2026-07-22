import { CATEGORIES } from "@/lib/pipeline/prompts";
import type { ProviderAvailability } from "@/lib/pipeline/types";

const categoryRules: Record<string, string[]> = {
  Groceries: ["whole foods", "trader joe", "costco", "walmart", "kroger", "safeway", "aldi", "publix"],
  Dining: [
    "chipotle",
    "starbucks",
    "mcdonald",
    "burger king",
    "subway",
    "dunkin",
    "chick-fil",
    "taco bell",
    "pizza",
    "sushi",
    "restaurant",
    "cafe",
    "grill",
    "diner",
    "kitchen",
    "eatery",
    "sweetgreen",
    "pret",
    "cheesecake",
    "uber eats",
    "seamless",
    "doordash",
    "grubhub"
  ],
  Transport: ["uber", "lyft", "taxi", "metro", "transit", "shell", "exxon", "chevron", "bp", "gas station", "parking"],
  Shopping: ["amazon", "target", "walmart", "zara", "h&m", "gap", "nike", "apple store", "best buy", "home depot", "ikea", "barnes"],
  Entertainment: ["netflix", "spotify", "hulu", "disney", "apple tv", "youtube", "amc", "cinema", "theatre", "ticketmaster"],
  Health: ["cvs", "walgreens", "rite aid", "pharmacy", "doctor", "dental", "gym", "planet fitness", "hospital"],
  Travel: ["delta", "united", "american airlines", "southwest", "airbnb", "hotel", "marriott", "hilton", "expedia"],
  Utilities: ["electric", "water", "gas bill", "internet", "verizon", "at&t", "t-mobile", "con edison", "comcast"]
};

function normalizeCategory(value: string) {
  const match = CATEGORIES.find((category) => category.toLowerCase() === value.trim().toLowerCase());
  return match ?? "Other";
}

export function categorizeWithRegex(merchant: string) {
  const normalizedMerchant = merchant.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryRules)) {
    if (keywords.some((keyword) => normalizedMerchant.includes(keyword))) {
      return category;
    }
  }
  return "Other";
}

export async function checkRegexCategorizationAvailability(): Promise<ProviderAvailability> {
  return { available: true, message: "Built-in keyword categorizer ready." };
}

export async function categorizeBatchWithRegex(merchants: string[]) {
  return merchants.map(categorizeWithRegex);
}

export { normalizeCategory };
