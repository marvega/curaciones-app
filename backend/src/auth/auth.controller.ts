import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

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
}
