import { roomCapacity,seatGrid,type RoomShape,type SeatSlot } from "@/lib/academic/room-capacity";
import type { ExamSeatSupport } from "./exam-session-plan";
type Room=RoomShape&{id:string};
type Candidate={id:string};
type Allocation={studentId:string;roomId:string;seat:SeatSlot};
/** Recorded room coordinates only; no disability or physical-access inference. */
export function allocateSupportedSeats(candidates:Candidate[],rooms:Room[],support:ExamSeatSupport[]):Allocation[]{
 if(support.some(row=>!row.confirmed||!candidates.some(student=>student.id===row.studentId)))throw new Error("Review every seating adjustment against an active candidate in this class.");
 if(new Set(support.map(row=>row.studentId)).size!==support.length)throw new Error("A candidate has duplicate seating adjustments.");
 const isolated=new Map<string,string>();for(const row of support)if(row.separateRoomId){if(!rooms.some(room=>room.id===row.separateRoomId)||isolated.has(row.separateRoomId))throw new Error("Each separate-room candidate needs a distinct allocated room.");isolated.set(row.separateRoomId,row.studentId);}
 const slots=rooms.flatMap(room=>seatGrid(room).map(seat=>({roomId:room.id,seat,room})));
 if(slots.length>6000)throw new Error("Narrow the selected room capacity before generating seating.");
 const constrained=support.map(row=>({row,options:slots.filter(slot=>(!isolated.has(slot.roomId)||isolated.get(slot.roomId)===row.studentId)&&(!row.separateRoomId||row.separateRoomId===slot.roomId)&&(!(row.frontRow||row.edgeSeat||row.extraSpacing)||roomCapacity(slot.room).hasLayout)&&(!row.frontRow||slot.seat.rowNo===1)&&(!row.edgeSeat||slot.seat.benchNo===1&&slot.seat.seatOnBench===1||slot.seat.benchNo===slot.room.benchesPerRow&&slot.seat.seatOnBench===Math.min(slot.room.examSeatsPerBench,slot.room.seatsPerBench)))})).sort((a,b)=>a.options.length-b.options.length||Number(b.row.extraSpacing)-Number(a.row.extraSpacing)||a.row.studentId.localeCompare(b.row.studentId));
 if(constrained.some(row=>!row.options.length))throw new Error("A seating adjustment has no eligible seat. Check recorded layouts, front/edge positions and separate rooms.");
 const placed:Array<Allocation&{extraSpacing:boolean}>=[];let steps=0;
 const available=(roomId:string,seat:SeatSlot,extraSpacing:boolean)=>!placed.some(item=>item.roomId===roomId&&(item.seat.seatNumber===seat.seatNumber||(item.extraSpacing||extraSpacing)&&Math.abs(item.seat.rowNo-seat.rowNo)<=1&&Math.abs(item.seat.benchNo-seat.benchNo)<=1));
 const fill=():Allocation[]|null=>{const result:Allocation[]=[...placed],used=new Set(placed.map(row=>`${row.roomId}:${row.seat.seatNumber}`));for(const student of candidates.filter(row=>!support.some(item=>item.studentId===row.id))){const slot=slots.find(row=>!isolated.has(row.roomId)&&!used.has(`${row.roomId}:${row.seat.seatNumber}`)&&available(row.roomId,row.seat,false));if(!slot)return null;used.add(`${slot.roomId}:${slot.seat.seatNumber}`);result.push({studentId:student.id,roomId:slot.roomId,seat:slot.seat});}return rooms.every(room=>result.some(row=>row.roomId===room.id))?result:null;};
 const search=(index:number):Allocation[]|null=>{if(++steps>100000)throw new Error("The bounded seating search needs a narrower plan or fewer combined adjustments.");if(index===constrained.length)return fill();const{row,options}=constrained[index];for(const slot of options){if(!available(slot.roomId,slot.seat,row.extraSpacing))continue;placed.push({studentId:row.studentId,roomId:slot.roomId,seat:slot.seat,extraSpacing:row.extraSpacing});const result=search(index+1);if(result)return result;placed.pop();}return null;};
 const result=search(0);if(!result)throw new Error("The selected rooms cannot meet every approved seating adjustment and seat the whole class. Add capacity or revise the reviewed plan.");return result;
}
