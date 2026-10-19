export type { GeoPoint2d as PolygonVertex } from "./mavkit-types";

/** Corner of the survey bounding box used to begin the path. */
export type StartCorner = "top_left" | "top_right" | "bottom_left" | "bottom_right";
export type TurnDirection = "clockwise" | "counterclockwise";
