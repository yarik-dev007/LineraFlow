import { useContext } from 'react';
import { LineraContext } from './LineraProvider';

export const useLinera = () => useContext(LineraContext);
