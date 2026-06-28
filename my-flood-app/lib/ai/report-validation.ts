import { type YoloWaterLevelResult } from "@/lib/ai/yolo-water-level";

export type ReportValidationResult = {
  verdict: "accepted" | "needs_review" | "rejected";
  reason: string;
  floodVerdict: "confirmed_flood" | "not_flood" | "unknown";
  locationVerdict: "gps_verified" | "manual_location" | "weak_location" | "outside_service_area";
};

const floodPattern = /(flood|flooding|water|waterline|inundation|road_flood|level[-_ ]?\d+)/i;
const negativePattern = /(dry|no[_ -]?flood|not[_ -]?flood|normal|safe)/i;

function inThailand(lat: number, lng: number) {
  return lat >= 5.2 && lat <= 20.8 && lng >= 97.3 && lng <= 105.9;
}
function floodVerdict(yolo: YoloWaterLevelResult) {
  const labels = yolo.labels.join(" ");
  const confident = yolo.confidence === null || yolo.confidence >= 0.45;
  if (yolo.risk === "danger" || yolo.risk === "watch" || (yolo.depthCm !== null && yolo.depthCm > 5) || floodPattern.test(labels)) return "confirmed_flood" as const;
  if (yolo.source === "yolo" && confident && yolo.risk === "safe" && (negativePattern.test(labels) || yolo.depthCm === 0 || yolo.labels.length > 0)) return "not_flood" as const;
  return "unknown" as const;
}

function locationVerdict(lat: number, lng: number, source: string | null, accuracyM: number | null) {
  const defaultBangkok = Math.abs(lat - 13.7563) < 0.0002 && Math.abs(lng - 100.5018) < 0.0002;
  if (!inThailand(lat, lng) || source === "default" || defaultBangkok) return "outside_service_area" as const;
  if (source === "gps" && (accuracyM === null || accuracyM <= 1500)) return "gps_verified" as const;
  if (source === "manual") return "manual_location" as const;
  return "weak_location" as const;
}
export function validateFloodReport(input: {
  yolo: YoloWaterLevelResult;
  lat: number;
  lng: number;
  locationSource: string | null;
  locationAccuracyM: number | null;
}): ReportValidationResult {
  const aiFlood = floodVerdict(input.yolo);
  const aiLocation = locationVerdict(input.lat, input.lng, input.locationSource, input.locationAccuracyM);
  if (aiLocation === "outside_service_area") return { verdict: "rejected", reason: "Location is outside the supported service area or still uses the default map point.", floodVerdict: aiFlood, locationVerdict: aiLocation };
  if (aiFlood === "not_flood") return { verdict: "rejected", reason: "AI did not find flood evidence in this image.", floodVerdict: aiFlood, locationVerdict: aiLocation };
  if (aiFlood === "confirmed_flood" && (aiLocation === "gps_verified" || aiLocation === "manual_location")) return { verdict: "accepted", reason: "AI and location checks passed.", floodVerdict: aiFlood, locationVerdict: aiLocation };
  return { verdict: "needs_review", reason: "AI or location confidence is not strong enough; keep this case for human review.", floodVerdict: aiFlood, locationVerdict: aiLocation };
}