param projectName string = 'invapp'
param location string = resourceGroup().location

resource storage 'Microsoft.Storage/storageAccounts@2023-04-01' = {
  name: '${projectName}st'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}
