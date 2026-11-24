// These represent actual mutations to external enterprise systems.
// Agents NEVER call these directly. They are invoked by the ApprovalService.

export const sendCustomerEmail = async (customerId: string, content: string) => {
  console.log(`\n[EXTERNAL WRITE SECURE] 📧 Sending email to ${customerId}`);
  console.log(`Content: ${content.substring(0, 50)}...\n`);
  
  // Simulate network delay to an external API like SendGrid or Exchange
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return { 
    success: true, 
    deliveredAt: new Date().toISOString(),
    systemId: `MSG-${Math.floor(Math.random() * 10000)}` 
  };
};

export const proposeCustomerUpdate = async (customerId: string, changes: any) => {
  console.log(`\n[EXTERNAL WRITE SECURE] 🔄 Updating CRM for ${customerId}`);
  console.log(`Changes: ${JSON.stringify(changes)}\n`);
  
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return { success: true, updatedAt: new Date().toISOString() };
};