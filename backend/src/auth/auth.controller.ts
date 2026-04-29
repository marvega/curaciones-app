import { Controller, Post, Body, Req, UseGuards, HttpCode, HttpStatus, Get, Delete, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenGuard } from './refresh-token.guard';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { SessionsService } from './sessions.service';
import { SwitchOrgDto } from './dto/switch-org.dto';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InvitationsService } from './invitations.service';
import { InvitationPreviewDto } from './dto/invitation-preview.dto';
import { InvitationAcceptDto } from './dto/invitation-accept.dto';

const LOGIN_LIMIT = parseInt(
  process.env.THROTTLE_LOGIN_LIMIT ?? (process.env.NODE_ENV === 'production' ? '5' : '10000'),
  10,
);

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly passwordReset: PasswordResetService,
    private readonly invitations: InvitationsService,
  ) {}

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

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: RefreshDto, @CurrentUser() user: any) {
    // best-effort: decode to find jti
    const payload = this.jwt.decode(dto.refreshToken) as any;
    if (payload?.jti) {
      await this.sessions.revokeByJti(user.id, payload.jti);
    }
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: any) {
    await this.authService.logoutAll(user.id);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async listSessions(@CurrentUser() user: any) {
    return this.sessions.listForUser(user.id, user.jti);
  }

  @Delete('sessions/:jti')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async revokeSession(@Param('jti') jti: string, @CurrentUser() user: any) {
    await this.sessions.revokeByJti(user.id, jti);
  }

  @Post('switch-org')
  @UseGuards(JwtAuthGuard)
  async switchOrg(@Body() dto: SwitchOrgDto, @CurrentUser() user: any) {
    return this.authService.switchOrg(user.id, dto.organizationId);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordReset.forgot(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.authService.resetPassword(dto.token, dto.newPassword, req.ip, req.headers['user-agent']);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: any, @Req() req: Request) {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    await this.sessions.revokeAllForUser(user.id);
    // notify
    const u = await this.authService.userById(user.id);
    if (u?.emailHash) {
      // best-effort send via passwordReset.email path or inject EmailService here
    }
  }

  @Post('invitations/preview')
  async previewInvitation(@Body() dto: InvitationPreviewDto) {
    return this.invitations.preview(dto.token);
  }

  @Post('invitations/accept')
  async acceptInvitation(@Body() dto: InvitationAcceptDto, @Req() req: Request) {
    const user = await this.invitations.accept(dto.token, dto.password, dto.fullName);
    const memberships = await this.authService.findMemberships(user.id);
    const m = memberships[0];
    const { accessToken } = await this.authService.signAccessToken(user, m.organizationId);
    const refresh = await this.sessions.issue(user.id, m.organizationId, req.ip, req.headers['user-agent']);
    return { accessToken, refreshToken: refresh.refreshToken };
  }
}
