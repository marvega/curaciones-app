import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserPreferences, DEFAULT_PREFERENCES } from './user.entity';
import { CreateUserDto } from './create-user.dto';
import { UpdatePreferencesDto } from './update-preferences.dto';

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
    });
    return this.userRepo.save(user);
  }

  async findAll() {
    return this.userRepo.find({
      order: { username: 'ASC' },
      select: ['id', 'username', 'createdAt'],
    });
  }

  async getPreferences(userId: number): Promise<UserPreferences> {
    const user = await this.findById(userId);
    return { ...DEFAULT_PREFERENCES, ...user.preferences };
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto): Promise<UserPreferences> {
    const user = await this.findById(userId);
    user.preferences = { ...DEFAULT_PREFERENCES, ...user.preferences, ...dto };
    await this.userRepo.save(user);
    return user.preferences as UserPreferences;
  }

  async seed() {
    // TODO(phase-13.1b): seed should also create default Organization +
    // OrganizationMembership for admin users. For now this just inserts the
    // bare User rows so tsc compiles; org membership wiring is out of scope.
    const users = [
      { username: 'admin', password: 'A}B5sxY%2=qy' },
      { username: 'cynthia', password: 'pompeya2026' },
    ];

    const created: User[] = [];
    for (const u of users) {
      const existing = await this.findByUsername(u.username);
      if (!existing) {
        const hash = await bcrypt.hash(u.password, 10);
        const user = this.userRepo.create({
          username: u.username,
          passwordHash: hash,
        });
        const saved = await this.userRepo.save(user);
        created.push(saved);
      }
    }
    return { created: created.length };
  }
}
