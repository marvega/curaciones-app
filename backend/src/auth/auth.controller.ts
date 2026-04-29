import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenGuard } from './refresh-token.guard';
import { RefreshDto } from './dto/refresh.dto';

const LOGIN_LIMIT = parseInt(
  process.env.THROTTLE_LOGIN_LIMIT ?? (process.env.NODE_ENV === 'production' ? '5' : '10000'),
  10,
);

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: LOGIN_LIMIT } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.usernameOrEmail, dto.password, req.ip, req.headers['user-agent']);
  }

  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  async refresh(@Body() dto: RefreshDto, @Req() req: any) {
    return this.authService.refresh(dto.refreshToken, req.refreshPayload, req.ip, req.headers['user-agent']);
  }
}
