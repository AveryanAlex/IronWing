export function pathFromSvelteKitRouteId(routeId: string | null | undefined): string | null {
  if (!routeId) {
    return null;
  }

  const appRouteGroup = "/(app)";
  if (routeId === appRouteGroup) {
    return "/";
  }

  if (routeId.startsWith(`${appRouteGroup}/`)) {
    return routeId.slice(appRouteGroup.length);
  }

  return routeId.startsWith("/") ? routeId : null;
}
