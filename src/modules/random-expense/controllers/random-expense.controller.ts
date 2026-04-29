import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { RandomExpenseService } from '../services/random-expense.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  GetPendingExpensesDto,
  GetExpenseHistoryDto,
  PayExpenseDto,
  TriggerWeeklyExpenseDto,
} from '../dto/expense-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class RandomExpenseController {
  constructor(
    private readonly randomExpenseService: RandomExpenseService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /expenses/pending
   * Get pending (unpaid) expenses for the logged-in student
   * Query: termId (required), weekNo (optional), page, limit
   */
  @Get('pending')
  @NeededPermissions([PERMISSIONS.EXPENSE.VIEW_OWN])
  async getPendingExpenses(
    @Request() req: any,
    @Query() query: GetPendingExpensesDto,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      query.termId,
    );
    return this.randomExpenseService.getPendingExpenses(
      studentProfileId,
      query,
    );
  }

  /**
   * GET /expenses/history
   * Get paid expense history for the logged-in student
   * Query: termId (required), weekNo (optional), page, limit
   */
  @Get('history')
  @NeededPermissions([PERMISSIONS.EXPENSE.VIEW_OWN])
  async getExpenseHistory(
    @Request() req: any,
    @Query() query: GetExpenseHistoryDto,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      query.termId,
    );
    return this.randomExpenseService.getExpenseHistory(studentProfileId, query);
  }

  /**
   * GET /expenses/all
   * Get all expenses (both paid and unpaid) for the logged-in student
   * Query: termId (required), page, limit
   */
  @Get('all')
  @NeededPermissions([PERMISSIONS.EXPENSE.VIEW_OWN])
  async getAllExpenses(
    @Request() req: any,
    @Query('termId', new ParseUUIDPipe()) termId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      termId,
    );
    return this.randomExpenseService.getAllExpenses(
      studentProfileId,
      termId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  /**
   * GET /expenses/summary
   * Get summary stats for the logged-in student's expenses
   * Query: termId (required)
   */
  @Get('summary')
  @NeededPermissions([PERMISSIONS.EXPENSE.VIEW_OWN])
  async getExpenseSummary(
    @Request() req: any,
    @Query('termId', new ParseUUIDPipe()) termId: string,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      termId,
    );
    return this.randomExpenseService.getExpenseSummary(
      studentProfileId,
      termId,
    );
  }

  /**
   * POST /expenses/pay
   * Pay a pending expense
   * Body: { studentExpenseId, sourceType?, sourceRef? }
   */
  @Post('pay')
  @NeededPermissions([PERMISSIONS.EXPENSE.PAY_OWN])
  async payExpense(@Request() req: any, @Body() body: PayExpenseDto) {
    // Look up the expense to get termId for profile resolution
    const expense = await this.prisma.studentExpense.findUnique({
      where: { id: body.studentExpenseId },
      select: { termId: true },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      expense.termId,
    );
    return this.randomExpenseService.payExpense(studentProfileId, body);
  }

  /**
   * POST /expenses/trigger
   * Admin/Teacher endpoint to manually trigger weekly expense generation
   * Body: { termId, weekNo? }
   */
  @Post('trigger')
  @NeededPermissions([PERMISSIONS.EXPENSE.TRIGGER])
  async triggerWeeklyExpenses(@Body() body: TriggerWeeklyExpenseDto) {
    return this.randomExpenseService.triggerWeeklyExpenses(body);
  }

  /**
   * GET /expenses/current-week
   * Get expenses for the current week (for home page preview)
   * Query: termId (required)
   */
  @Get('current-week')
  @NeededPermissions([PERMISSIONS.EXPENSE.VIEW_OWN])
  async getCurrentWeekExpenses(
    @Request() req: any,
    @Query('termId', new ParseUUIDPipe()) termId: string,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      termId,
    );
    return this.randomExpenseService.getCurrentWeekExpenses(
      studentProfileId,
      termId,
    );
  }

  /**
   * GET /expenses/unacknowledged
   * Get paid expenses the student hasn't seen yet (for home page dialog)
   * Query: termId (required)
   */
  @Get('unacknowledged')
  @NeededPermissions([PERMISSIONS.EXPENSE.VIEW_OWN])
  async getUnacknowledgedExpenses(
    @Request() req: any,
    @Query('termId', new ParseUUIDPipe()) termId: string,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      termId,
    );
    return this.randomExpenseService.getUnacknowledgedExpenses(
      studentProfileId,
      termId,
    );
  }

  /**
   * POST /expenses/:id/acknowledge
   * Mark a single expense as acknowledged (seen by student)
   */
  @Post(':id/acknowledge')
  @NeededPermissions([PERMISSIONS.EXPENSE.ACKNOWLEDGE_OWN])
  async acknowledgeExpense(
    @Request() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('termId', new ParseUUIDPipe()) termId: string,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      termId,
    );
    return this.randomExpenseService.acknowledgeExpense(studentProfileId, id);
  }

  /**
   * POST /expenses/acknowledge-all
   * Mark all unacknowledged expenses as seen
   * Body: { termId }
   */
  @Post('acknowledge-all')
  @NeededPermissions([PERMISSIONS.EXPENSE.ACKNOWLEDGE_OWN])
  async acknowledgeAllExpenses(
    @Request() req: any,
    @Body() body: { termId: string },
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      body.termId,
    );
    return this.randomExpenseService.acknowledgeAllExpenses(
      studentProfileId,
      body.termId,
    );
  }

  /**
   * GET /expenses/wallet-balance
   * Get the student's current wallet balance
   * Query: termId (required)
   */
  @Get('wallet-balance')
  @NeededPermissions([PERMISSIONS.FINANCE.WALLET_VIEW_OWN])
  async getWalletBalance(
    @Request() req: any,
    @Query('termId', new ParseUUIDPipe()) termId: string,
  ) {
    const studentProfileId = await this.resolveStudentProfileId(
      req.user.id,
      termId,
    );
    const balance =
      await this.randomExpenseService.getWalletBalance(studentProfileId);
    return { balance };
  }

  // ──────────────────────────────────────────────
  //  HELPERS
  // ──────────────────────────────────────────────

  /**
   * Resolve studentProfileId from userId and termId.
   */
  private async resolveStudentProfileId(
    userId: string,
    termId: string,
  ): Promise<string> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId_termId: { userId, termId } },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException(
        'Student profile not found for this user and term',
      );
    }
    return profile.id;
  }
}
