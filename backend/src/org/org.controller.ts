import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.type';
import { OrgService } from './org.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('Org')
@ApiBearerAuth()
@Controller('api/org')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: JwtUser) {
    return this.org.getSettings(user.organizationId);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.org.updateSettings(user.organizationId, dto);
  }

  @Get('members')
  listMembers(@CurrentUser() user: JwtUser) {
    return this.org.listMembers(user.organizationId);
  }

  @Patch('members/:userId')
  updateRole(
    @CurrentUser() user: JwtUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.org.updateRole(user.organizationId, userId, dto.role);
  }

  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeMember(
    @CurrentUser() user: JwtUser,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.org.revokeMember(user.organizationId, userId, user.id);
  }

  @Get('invitations')
  listInvitations(@CurrentUser() user: JwtUser) {
    return this.org.listInvitations(user.organizationId);
  }
}
