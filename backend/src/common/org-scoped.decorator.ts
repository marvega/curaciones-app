const TENANTED_ENTITIES = new Set<Function>();

export function OrgScoped(): ClassDecorator {
  return (target: any) => {
    TENANTED_ENTITIES.add(target);
  };
}

export function isOrgScopedEntity(target: Function): boolean {
  return TENANTED_ENTITIES.has(target);
}

export function listOrgScopedEntities(): Function[] {
  return Array.from(TENANTED_ENTITIES);
}
