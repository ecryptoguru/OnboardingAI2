import * as fs from 'fs';
const contents = fs.readFileSync('components/UniversityDetail.tsx', 'utf8');

const targetStr = `<TabsContent value="signals" className="mt-[50%]"`; // oops wait
