import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CategoryConcept } from './category_concept.entity';
import { HistoryConcept } from './history_concept.entity';
import { FileConcept } from './file_concept.entity';
import { User } from './user.entity';

@Entity()
export class Concept {
  @PrimaryGeneratedColumn('increment')
  conceptId: number;

  @Column({ nullable: true })
  modelName: string;

  @Column({ nullable: true })
  plName: string;

  @Column({ nullable: true })
  code: string;

  @Column({ nullable: true })
  productName: string;

  @Column({ nullable: true })
  regisDate: string;

  @Column({ nullable: true })
  approval: string; // nguoi duyet

  @Column({ nullable: true, default: null })
  deleteAt: Date;

  @Column({ nullable: true, default: null })
  deleteBy: string;

  @ManyToOne(() => CategoryConcept, (ref) => ref.concepts)
  @JoinColumn({ name: 'categoryId', referencedColumnName: 'categoryId' })
  category: CategoryConcept;

  @ManyToOne(() => User, (ref) => ref.concepts)
  @JoinColumn({ name: 'userId', referencedColumnName: 'userId' })
  user: User;

  // @OneToMany(() => ReportQC, (ref) => ref.concept)
  // reportQC: ReportQC[];

  @OneToMany(() => HistoryConcept, (ref) => ref.concept)
  histories: HistoryConcept[];

  @OneToMany(() => FileConcept, (ref) => ref.concept)
  files: FileConcept[];
}
