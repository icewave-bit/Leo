import { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import {
  balanceReplenishStudentIdAtom,
  studentLessonsBumpAtom,
  studentsAtom,
} from '../atoms/schedule';
import {
  paymentsCustomFromAtom,
  paymentsCustomToAtom,
  paymentsPeriodAtom,
  paymentsStudentIdAtom,
} from '../atoms/payments';
import { BalanceReplenishDialog } from '../components/students/BalanceReplenishDialog';
import { PaymentsJournal } from '../components/payments/PaymentsJournal';
import { loadBalanceMovements } from '../state/loadBalanceMovements';
import { reloadStudents } from '../state/reloadStudents';
import { useAppStore } from '../hooks/useAppStore';

export function PaymentsPage() {
  const navigate = useNavigate();
  const students = useAtomValue(studentsAtom);
  const [replenishId, setReplenishId] = useAtom(balanceReplenishStudentIdAtom);
  const period = useAtomValue(paymentsPeriodAtom);
  const studentId = useAtomValue(paymentsStudentIdAtom);
  const customFrom = useAtomValue(paymentsCustomFromAtom);
  const customTo = useAtomValue(paymentsCustomToAtom);
  const lessonsBump = useAtomValue(studentLessonsBumpAtom);
  const store = useAppStore();

  const replenishStudent = replenishId
    ? students.find((s) => s.id === replenishId)
    : undefined;

  useEffect(() => {
    void loadBalanceMovements(store.get, store.set);
  }, [store, period, studentId, customFrom, customTo, lessonsBump]);

  const onReplenished = () => {
    void reloadStudents(store.get, store.set);
    void loadBalanceMovements(store.get, store.set);
  };

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <h1 className="top__title">Оплаты</h1>
        </div>
      </header>

      <div className="payments-board">
        <PaymentsJournal />
      </div>

      {replenishStudent ? (
        <BalanceReplenishDialog
          student={replenishStudent}
          open={Boolean(replenishId)}
          onClose={() => setReplenishId(null)}
          onReplenished={onReplenished}
          onOpenStudent={(id) => navigate(`/students/${id}`)}
        />
      ) : null}
    </div>
  );
}
