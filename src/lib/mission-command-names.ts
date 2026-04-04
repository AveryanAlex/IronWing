/** Convert a PascalCase variant key to a human-readable display name. */
export function pascalToDisplay(name: string): string {
    // Insert spaces before uppercase letters that follow lowercase letters or
    // before sequences of uppercase followed by lowercase (e.g., "ROILocation" -> "ROI Location").
    return name
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}
