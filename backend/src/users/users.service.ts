import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async findById(id: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async create(dto: CreateUserDto, createdBy?: { id: number; role: string }) {
    if (createdBy && createdBy.role !== 'admin') {
      throw new ConflictException('Solo los administradores pueden crear usuarios');
    }

    const existing = await this.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException(`El usuario ${dto.username} ya existe`);
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      username: dto.username,
      passwordHash: hash,
      role: dto.role || 'user',
    });
    return this.userRepo.save(user);
  }

  async findAll() {
    return this.userRepo.find({
      order: { username: 'ASC' },
      select: ['id', 'username', 'role', 'createdAt'],
    });
  }

  async seed() {
    const users = [
      { username: 'admin', password: 'A}B5sxY%2=qy', role: 'admin' },
      { username: 'cynthia', password: 'pompeya2026', role: 'admin' },
    ];

    const created: User[] = [];
    for (const u of users) {
      const existing = await this.findByUsername(u.username);
      if (!existing) {
        const hash = await bcrypt.hash(u.password, 10);
        const user = this.userRepo.create({
          username: u.username,
          passwordHash: hash,
          role: u.role,
        });
        const saved = await this.userRepo.save(user);
        created.push(saved);
      }
    }
    return { created: created.length };
  }
}
