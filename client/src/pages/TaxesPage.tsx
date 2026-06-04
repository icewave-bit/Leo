import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { tutorAtom } from '../atoms/auth';
import { taxesMonthAtom, taxesStudentIdAtom } from '../atoms/taxes';
import { TaxesJournal } from '../components/taxes/TaxesJournal';
import { useAppStore } from '../hooks/useAppStore';
import { loadTaxes } from '../state/loadTaxes';
import { currentMonthKey } from '../utils/taxMonth';

export function TaxesPage() {
  const tutor = useAtomValue(tutorAtom);
  const month = useAtomValue(taxesMonthAtom);
  const studentId = useAtomValue(taxesStudentIdAtom);
  const displayCurrency = tutor?.taxDisplayCurrency ?? 'BYN';
  const store = useAppStore();

  useEffect(() => {
    if (tutor && !month) {
      store.set(taxesMonthAtom, currentMonthKey(tutor.timezone));
    }
  }, [tutor, month, store]);

  useEffect(() => {
    void loadTaxes(store.get, store.set);
  }, [store, month, studentId, displayCurrency]);

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <h1 className="top__title">Налоги</h1>
          <p className="top__sub">
            Пополнения в деньгах или в уроках (по ставке). Сумма налога — по ставке из настроек.
            {displayCurrency === 'BYN'
              ? ' Пересчёт в BYN — курс НБРБ на дату пополнения.'
              : ' Перевод в другую валюту отключён в настройках.'}
          </p>
        </div>
      </header>

      <div className="payments-board">
        <TaxesJournal />
      </div>
    </div>
  );
}
