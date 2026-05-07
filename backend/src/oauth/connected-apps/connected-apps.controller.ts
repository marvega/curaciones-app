import { Controller, Get, Delete, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { NoOAuthAccess } from '../decorators/no-oauth-access.decorator';
import { ConnectedAppsService } from './connected-apps.service';

@NoOAuthAccess()
@Controller('api/account/connected-apps')
@UseGuards(JwtAuthGuard)
export class ConnectedAppsController {
  constructor(private readonly service: ConnectedAppsService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.service.listForUser(user.id);
  }

  @Delete(':grantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: any, @Param('grantId') grantId: string): Promise<void> {
    await this.service.revoke(user.id, grantId);
  }
}
