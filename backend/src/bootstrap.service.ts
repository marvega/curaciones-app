import { Injectable, OnModuleInit } from '@nestjs/common';
import { UsersService } from './users/users.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(private readonly usersService: UsersService) {}

  async onModuleInit() {
    const result = await this.usersService.seed();
    if (result.created > 0) {
      console.log(`[Bootstrap] Se crearon ${result.created} usuario(s) inicial(es)`);
    }
  }
}
