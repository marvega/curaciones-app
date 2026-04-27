import { Controller, Get, Post, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './create-user.dto';
import { UpdatePreferencesDto } from './update-preferences.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user preferences' })
  async getPreferences(@CurrentUser() user: any) {
    return this.usersService.getPreferences(user.id);
  }

  @Put('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update current user preferences' })
  async updatePreferences(@CurrentUser() user: any, @Body() dto: UpdatePreferencesDto) {
    return this.usersService.updatePreferences(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: { id: number; role: string }) {
    return this.usersService.create(dto, user);
  }

  @Post('seed')
  async seed() {
    return this.usersService.seed();
  }
}
