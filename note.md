

// this how which slot to put in is been calculated for fixed size array

$$\text{Slot} = \text{keccak256}(\text{ArraySlot}) + \left( \frac{i \times \text{sizeOf(Type)}}{256} \right)$$




for nexted mapping how will user provide the keey to the maaping json file 


need to check how data is been passed to mapping for slot calculation



0xa9ec9f8A35148e4258F2B06520BBc71c1b38bB48


/* Need to add a  add this to cli so users  can verify easily */

```javascript

export function validateArtifact(artifactPath: string): { valid: boolean; error?: string } {
  try {
```







keep mapping that return struct that contain array tho simil opperation like above is been performd if it 32 byts no packed else it will  be packed together


 caclulating bytes char, extracting

startChar = $$\text{startChar} = (32 - \text{offset} - \text{size}) \times 2$$
 endChar = $$\text{endChar} =  startChar( number of bytes * 2 )


