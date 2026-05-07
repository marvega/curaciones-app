import { Controller, Get, Post, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './create-user.dto';
import { UpdatePreferencesDto } from './update-preferences.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';
import { NoOAuthAccess } from '../oauth/decorators/no-oauth-access.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/preferences')
  @UseGuards(MultiAuthGuard, OAuthScopeGuard)
  @RequiredScopes('org:admin')
  @ApiOperation({ summary: 'Get current user preferences' })
  async getPreferences(@CurrentUser() user: any) {
    return this.usersService.getPreferences(user.id);
  }

  @Put('me/preferences')
  @UseGuards(MultiAuthGuard, OAuthScopeGuard)
  @RequiredScopes('org:admin')
  @ApiOperation({ summary: 'Update current user preferences' })
  async updatePreferences(@CurrentUser() user: any, @Body() dto: UpdatePreferencesDto) {
    return this.usersService.updatePreferences(user.id, dto);
  }

  @Get()
  @UseGuards(MultiAuthGuard, OAuthScopeGuard, RolesGuard)
  @RequiredScopes('org:admin')
  @Roles('admin')
  async findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @UseGuards(MultiAuthGuard, OAuthScopeGuard, RolesGuard)
  @RequiredScopes('org:admin')
  @Roles('admin')
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: { id: number; role: string }) {
    return this.usersService.create(dto, user);
  }

  // Anonymous bootstrap endpoint — never OAuth-accessible. Marked with
  // @NoOAuthAccess so the OAuth scope-coverage governance test treats this
  // explicitly as "not exposed via OAuth tokens" rather than missing a marker.
  @NoOAuthAccess()
  @Post('seed')
  async seed() {
    return this.usersService.seed();
  }
}
