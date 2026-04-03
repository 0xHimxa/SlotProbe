

 when to packed item to slot: 
if items are not updated same times is better to assign them seperately it will be chapper that way than updating on and leave the other it will be computational expensive because evm have to read, distructure, write(check prob might be better to use assembly yul when trying to  assign both)


// this how which slot to put in is been calculated

$$\text{Slot} = \text{keccak256}(\text{ArraySlot}) + \left( \frac{i \times \text{sizeOf(Type)}}{256} \right)$$




keep mapping that return struct that contain array tho simil opperation like above is been performd if it 32 byts no packed else it will  be packed together


dynamic string 

// make the outcome like this
  Old: owner (address)
  New: fee   (uint256)


 caclulating bytes char, extracting

startChar = $$\text{startChar} = (32 - \text{offset} - \text{size}) \times 2$$
 endChar = $$\text{endChar} =  startChar( number of bytes * 2 )