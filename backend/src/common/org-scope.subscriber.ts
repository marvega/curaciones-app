import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  DataSource,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { orgContext } from './org-context';
import { isOrgScopedEntity } from './org-scoped.decorator';

@Injectable()
@EventSubscriber()
export class OrgScopeSubscriber implements EntitySubscriberInterface {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<any>) {
    const target = event.metadata.target as Function;
    if (!isOrgScopedEntity(target)) return;
    const store = orgContext.getStore();
    if (store?.bypass) return;
    if (event.entity.organizationId) return;
    if (!store?.organizationId) {
      throw new Error(
        `Cannot insert into ${event.metadata.tableName} without org context`,
      );
    }
    event.entity.organizationId = store.organizationId;
  }
}
