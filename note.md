check bytesN decode for packed bytes decoding 

 when to packed item to slot: 
if items are not updated same times is better to assign them seperately it will be chapper that way than updating on and leave the other it will be computational expensive because evm have to read, distructure, write(check prob might be better to use assembly yul when trying to  assign both)


// this how which slot to put in is been calculated

$$\text{Slot} = \text{keccak256}(\text{ArraySlot}) + \left( \frac{i \times \text{sizeOf(Type)}}{256} \right)$$

 need to undo captue to it pev logic



add a helper that convert normal in put to hex






need to check how data is been passed to mapping for slot calculation



0xa9ec9f8A35148e4258F2B06520BBc71c1b38bB48








keep mapping that return struct that contain array tho simil opperation like above is been performd if it 32 byts no packed else it will  be packed together


dynamic string 

// make the outcome like this
  Old: owner (address)
  New: fee   (uint256)


 caclulating bytes char, extracting

startChar = $$\text{startChar} = (32 - \text{offset} - \text{size}) \times 2$$
 endChar = $$\text{endChar} =  startChar( number of bytes * 2 )


 check weather nested value is been handle for uint or other value than address

this following function Uitility is not been used it using the json provided since is has similar stufff
structMemberSlot, structMemberByteOffset
